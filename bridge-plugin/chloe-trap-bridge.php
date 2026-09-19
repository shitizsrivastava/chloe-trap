<?php
/**
 * Plugin Name: Chloe Trap Bridge
 * Description: Lets the Chloe Trap desktop app upload, install, update, activate, deactivate and delete plugins on this site over the REST API. Install once, then manage plugins for this site from Chloe Trap's Plugins screen.
 * Version: 1.0.0
 * Author: Chloe Trap
 */

if (!defined('ABSPATH')) exit;

define('CTB_VERSION', '1.0.0');

// Silent upgrader skin — the built-in skins print HTML admin-page markup as
// they go, which is meaningless (and noisy) inside a REST response. This one
// just collects plain-text progress/error messages instead.
//
// Defined lazily inside a function (not at the top level of the file) and
// guarded by class_exists(): WordPress loads every active plugin's file on
// EVERY request, not just in wp-admin, but WP_Upgrader_Skin only exists
// after wp-admin/includes/class-wp-upgrader.php is explicitly required.
// Declaring "class X extends WP_Upgrader_Skin" unconditionally at file scope
// makes PHP resolve the parent class immediately when the file loads, which
// fails (fatal error) on any request that hasn't already pulled in that
// admin-only file — which is most of them. Wrapping it in a function defers
// the class declaration until we actually call this, by which point
// ctb_require_admin_files() has already loaded the parent class.
function ctb_define_skin_class() {
	if (class_exists('Chloe_Bridge_Skin')) return;

	class Chloe_Bridge_Skin extends WP_Upgrader_Skin {
		public $messages = array();

		public function header() {}
		public function footer() {}

		public function feedback($string, ...$args) {
			if (isset($this->upgrader->strings[$string])) {
				$string = $this->upgrader->strings[$string];
			}
			if (strpos($string, '%') !== false && $args) {
				$string = vsprintf($string, $args);
			}
			$string = trim(wp_strip_all_tags($string));
			if ($string !== '') $this->messages[] = $string;
		}

		public function error($errors) {
			if (is_wp_error($errors)) {
				$this->messages[] = $errors->get_error_message();
			} elseif (is_string($errors)) {
				$this->messages[] = $errors;
			}
		}
	}
}

function ctb_require_admin_files() {
	require_once ABSPATH . 'wp-admin/includes/file.php';
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/misc.php';
	require_once ABSPATH . 'wp-admin/includes/class-wp-upgrader.php';
	require_once ABSPATH . 'wp-admin/includes/update.php';
}

function ctb_can_manage() {
	return current_user_can('install_plugins') && current_user_can('activate_plugins');
}

function ctb_backup_dir() {
	$dir = WP_CONTENT_DIR . '/chloe-trap-backups';
	if (!file_exists($dir)) {
		wp_mkdir_p($dir);
		@file_put_contents($dir . '/index.php', "<?php\n// Silence is golden.\n");
	}
	return $dir;
}

// Zips up a currently-installed plugin's folder before it gets overwritten,
// so an update or overwrite-install can be undone later via ctb_restore_plugin.
// Returns just the backup's filename (never a path — restore only trusts
// filenames it generates itself) or null if there was nothing to back up.
function ctb_backup_plugin($plugin_file) {
	if (!$plugin_file || !class_exists('ZipArchive')) return null;
	$slug = strtok($plugin_file, '/');
	if (!$slug || $slug === $plugin_file) return null; // single-file plugin — nothing to archive as a folder
	$plugin_dir = WP_PLUGIN_DIR . '/' . $slug;
	if (!is_dir($plugin_dir)) return null;

	$backup_name = $slug . '-' . gmdate('Ymd-His') . '.zip';
	$backup_path = ctb_backup_dir() . '/' . $backup_name;

	$za = new ZipArchive();
	if ($za->open($backup_path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) return null;
	$iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($plugin_dir), RecursiveIteratorIterator::LEAVES_ONLY);
	foreach ($iterator as $file) {
		if ($file->isDir()) continue;
		$real = $file->getRealPath();
		$relative = $slug . '/' . substr($real, strlen($plugin_dir) + 1);
		$za->addFile($real, str_replace('\\', '/', $relative));
	}
	$za->close();
	return $backup_name;
}

function ctb_status() {
	return array(
		'ok'               => true,
		'bridgeVersion'    => CTB_VERSION,
		'wpVersion'        => get_bloginfo('version'),
		'phpVersion'       => phpversion(),
		'canManagePlugins' => ctb_can_manage(),
	);
}

function ctb_list_plugins($request) {
	ctb_require_admin_files();

	if ($request->get_param('refresh')) {
		wp_clean_plugins_cache(true);
		wp_update_plugins();
	}

	$all = get_plugins();
	$active = (array) get_option('active_plugins', array());
	$updates = get_plugin_updates();

	$out = array();
	foreach ($all as $file => $data) {
		$upd = isset($updates[$file]) ? $updates[$file]->update : null;
		$out[] = array(
			'file'            => $file,
			'name'            => $data['Name'],
			'version'         => $data['Version'],
			'active'          => in_array($file, $active, true),
			'updateAvailable' => (bool) $upd,
			'newVersion'      => $upd->new_version ?? null,
		);
	}
	return $out;
}

function ctb_upload_plugin($request) {
	if (!ctb_can_manage()) {
		return new WP_Error('forbidden', 'This account needs install_plugins and activate_plugins capabilities.', array('status' => 403));
	}

	$files = $request->get_file_params();
	if (empty($files['file']) || $files['file']['error'] !== UPLOAD_ERR_OK) {
		return new WP_Error('no_file', 'No zip file received, or the upload failed.', array('status' => 400));
	}

	$tmp_name = $files['file']['tmp_name'];
	$orig_name = $files['file']['name'];
	if (!preg_match('/\.zip$/i', $orig_name)) {
		return new WP_Error('bad_file', 'Uploaded file must be a .zip archive.', array('status' => 400));
	}

	ctb_require_admin_files();

	// Peek at the zip's top-level folder (the plugin slug) without extracting
	// it, so we know whether this is a fresh install or an update to a
	// plugin that's already installed — and, if it was active, can restore
	// that afterward. Overwrite-installing can otherwise silently drop a
	// plugin out of the active list.
	$slug = null;
	if (class_exists('ZipArchive')) {
		$za = new ZipArchive();
		if ($za->open($tmp_name) === true) {
			for ($i = 0; $i < $za->numFiles; $i++) {
				$name = $za->getNameIndex($i);
				$pos = strpos($name, '/');
				if ($pos !== false) { $slug = substr($name, 0, $pos); break; }
			}
			$za->close();
		}
	}

	$existing_file = null;
	if ($slug) {
		foreach (get_plugins() as $file => $data) {
			if (strpos($file, $slug . '/') === 0) { $existing_file = $file; break; }
		}
	}
	$was_active = $existing_file && in_array($existing_file, (array) get_option('active_plugins', array()), true);

	// Back up whatever's already there BEFORE overwriting it, so an update
	// can be undone. A fresh install (no $existing_file) has nothing to back
	// up — undoing that is just deleting the newly-installed plugin instead.
	$backup_file = $existing_file ? ctb_backup_plugin($existing_file) : null;

	ctb_define_skin_class();
	$skin = new Chloe_Bridge_Skin();
	$upgrader = new Plugin_Upgrader($skin);
	$result = $upgrader->install($tmp_name, array('overwrite_package' => true));

	if (is_wp_error($result)) {
		return new WP_Error('install_failed', $result->get_error_message(), array('status' => 500));
	}
	if ($result !== true) {
		$msg = implode(' ', array_filter($skin->messages));
		return new WP_Error('install_failed', $msg ?: 'Install did not report success.', array('status' => 500));
	}

	$installed_file = $upgrader->plugin_info();
	if (!$installed_file) $installed_file = $existing_file;
	if (!$installed_file) {
		return new WP_Error('unknown_result', 'Plugin installed, but its main file could not be determined.', array('status' => 500));
	}

	$wants_activate = in_array($request->get_param('activate'), array('1', 1, true, 'true'), true);
	$activated = false;
	if ($was_active || $wants_activate) {
		$act = activate_plugin($installed_file);
		$activated = !is_wp_error($act);
	}

	$data = get_plugins();
	$info = $data[$installed_file] ?? array();

	return array(
		'success'    => true,
		'plugin'     => $installed_file,
		'name'       => $info['Name'] ?? ($slug ?: $orig_name),
		'version'    => $info['Version'] ?? null,
		'activated'  => $activated,
		'wasUpdate'  => (bool) $existing_file,
		'backupFile' => $backup_file,
	);
}

function ctb_update_plugin($request) {
	if (!ctb_can_manage()) {
		return new WP_Error('forbidden', 'This account needs install_plugins and activate_plugins capabilities.', array('status' => 403));
	}

	$plugin = $request->get_param('plugin');
	ctb_require_admin_files();

	if (!$plugin || !array_key_exists($plugin, get_plugins())) {
		return new WP_Error('not_found', 'That plugin is not installed on this site.', array('status' => 404));
	}

	wp_update_plugins();
	$current = get_site_transient('update_plugins');
	if (empty($current->response[$plugin])) {
		return new WP_Error('no_update', 'No update is currently available for this plugin.', array('status' => 400));
	}

	$was_active = in_array($plugin, (array) get_option('active_plugins', array()), true);
	$backup_file = ctb_backup_plugin($plugin);

	ctb_define_skin_class();
	$skin = new Chloe_Bridge_Skin();
	$upgrader = new Plugin_Upgrader($skin);
	$result = $upgrader->upgrade($plugin);

	if (is_wp_error($result)) {
		return new WP_Error('update_failed', $result->get_error_message(), array('status' => 500));
	}
	if ($result !== true) {
		$msg = implode(' ', array_filter($skin->messages));
		return new WP_Error('update_failed', $msg ?: 'Update did not report success.', array('status' => 500));
	}

	if ($was_active && !is_plugin_active($plugin)) activate_plugin($plugin);

	$data = get_plugins();
	$info = $data[$plugin] ?? array();
	return array(
		'success'    => true,
		'plugin'     => $plugin,
		'name'       => $info['Name'] ?? $plugin,
		'version'    => $info['Version'] ?? null,
		'backupFile' => $backup_file,
	);
}

function ctb_restore_plugin($request) {
	if (!ctb_can_manage()) {
		return new WP_Error('forbidden', 'This account needs install_plugins and activate_plugins capabilities.', array('status' => 403));
	}

	$backup_file = $request->get_param('backupFile');
	$plugin = $request->get_param('plugin');
	// Only ever trust filenames of the exact shape ctb_backup_plugin() itself
	// generates — never a caller-supplied path — to rule out path traversal.
	if (!$backup_file || !preg_match('/^[A-Za-z0-9_\-]+-\d{8}-\d{6}\.zip$/', $backup_file)) {
		return new WP_Error('bad_backup', 'Invalid backup filename.', array('status' => 400));
	}
	$backup_path = ctb_backup_dir() . '/' . $backup_file;
	if (!file_exists($backup_path)) {
		return new WP_Error('not_found', 'That backup no longer exists on this site.', array('status' => 404));
	}

	ctb_require_admin_files();
	$was_active = $plugin && in_array($plugin, (array) get_option('active_plugins', array()), true);

	ctb_define_skin_class();
	$skin = new Chloe_Bridge_Skin();
	$upgrader = new Plugin_Upgrader($skin);
	$result = $upgrader->install($backup_path, array('overwrite_package' => true));

	if (is_wp_error($result)) {
		return new WP_Error('restore_failed', $result->get_error_message(), array('status' => 500));
	}
	if ($result !== true) {
		$msg = implode(' ', array_filter($skin->messages));
		return new WP_Error('restore_failed', $msg ?: 'Restore did not report success.', array('status' => 500));
	}

	$restored_file = $upgrader->plugin_info() ?: $plugin;
	if ($was_active && $restored_file && !is_plugin_active($restored_file)) {
		activate_plugin($restored_file);
	}

	@unlink($backup_path);

	$data = get_plugins();
	$info = ($restored_file && isset($data[$restored_file])) ? $data[$restored_file] : array();
	return array('success' => true, 'plugin' => $restored_file, 'version' => $info['Version'] ?? null);
}

function ctb_activate_plugin($request) {
	if (!current_user_can('activate_plugins')) {
		return new WP_Error('forbidden', 'This account needs the activate_plugins capability.', array('status' => 403));
	}
	require_once ABSPATH . 'wp-admin/includes/plugin.php';

	$plugin = $request->get_param('plugin');
	if (!$plugin || !array_key_exists($plugin, get_plugins())) {
		return new WP_Error('not_found', 'Plugin not found.', array('status' => 404));
	}
	$result = activate_plugin($plugin);
	if (is_wp_error($result)) {
		return new WP_Error('activate_failed', $result->get_error_message(), array('status' => 500));
	}
	return array('success' => true, 'plugin' => $plugin, 'active' => true);
}

function ctb_deactivate_plugin($request) {
	if (!current_user_can('activate_plugins')) {
		return new WP_Error('forbidden', 'This account needs the activate_plugins capability.', array('status' => 403));
	}
	require_once ABSPATH . 'wp-admin/includes/plugin.php';

	$plugin = $request->get_param('plugin');
	if (!$plugin || !array_key_exists($plugin, get_plugins())) {
		return new WP_Error('not_found', 'Plugin not found.', array('status' => 404));
	}
	deactivate_plugins(array($plugin));
	return array('success' => true, 'plugin' => $plugin, 'active' => false);
}

function ctb_delete_plugin($request) {
	if (!current_user_can('delete_plugins')) {
		return new WP_Error('forbidden', 'This account needs the delete_plugins capability.', array('status' => 403));
	}
	require_once ABSPATH . 'wp-admin/includes/plugin.php';
	require_once ABSPATH . 'wp-admin/includes/file.php';

	$plugin = $request->get_param('plugin');
	if (!$plugin || !array_key_exists($plugin, get_plugins())) {
		return new WP_Error('not_found', 'Plugin not found.', array('status' => 404));
	}
	if (is_plugin_active($plugin)) deactivate_plugins(array($plugin));
	$result = delete_plugins(array($plugin));
	if (is_wp_error($result)) {
		return new WP_Error('delete_failed', $result->get_error_message(), array('status' => 500));
	}
	return array('success' => true, 'plugin' => $plugin);
}

add_action('rest_api_init', function () {
	$logged_in = function () { return is_user_logged_in(); };
	$manager   = function () { return is_user_logged_in() && ctb_can_manage(); };

	register_rest_route('chloe-bridge/v1', '/status', array(
		'methods' => 'GET', 'callback' => 'ctb_status', 'permission_callback' => $logged_in,
	));
	register_rest_route('chloe-bridge/v1', '/plugins', array(
		'methods' => 'GET', 'callback' => 'ctb_list_plugins', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/upload', array(
		'methods' => 'POST', 'callback' => 'ctb_upload_plugin', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/update', array(
		'methods' => 'POST', 'callback' => 'ctb_update_plugin', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/activate', array(
		'methods' => 'POST', 'callback' => 'ctb_activate_plugin', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/deactivate', array(
		'methods' => 'POST', 'callback' => 'ctb_deactivate_plugin', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/delete', array(
		'methods' => 'POST', 'callback' => 'ctb_delete_plugin', 'permission_callback' => $manager,
	));
	register_rest_route('chloe-bridge/v1', '/restore', array(
		'methods' => 'POST', 'callback' => 'ctb_restore_plugin', 'permission_callback' => $manager,
	));
});
