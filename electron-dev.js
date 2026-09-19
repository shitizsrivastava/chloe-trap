// Waits for Vite to be ready, then launches Electron
const { spawn } = require('child_process')
const http = require('http')

function waitForVite(port, maxWait = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now()
    const check = () => {
      const req = http.get(`http://localhost:${port}`, (res) => {
        resolve()
      })
      req.on('error', () => {
        if (Date.now() - start > maxWait) {
          reject(new Error('Vite did not start in time'))
        } else {
          setTimeout(check, 500)
        }
      })
      req.end()
    }
    check()
  })
}

console.log('Waiting for Vite on port 5173...')
waitForVite(5173).then(() => {
  console.log('Vite ready — launching Electron')
  const electronPath = require('./node_modules/electron')
  const proc = spawn(electronPath, ['.'], { stdio: 'inherit' })
  proc.on('close', (code) => process.exit(code))
}).catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
