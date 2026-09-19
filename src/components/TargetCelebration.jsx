import React from 'react'
import Confetti from './Confetti'
import SiteAvatar from './SiteAvatar'
import './TargetCelebration.css'

export default function TargetCelebration({ site, target, onClose, onSetNewTarget }) {
  return (
    <div className="celebration-overlay" onClick={onClose}>
      <Confetti />
      <div className="celebration-box" onClick={e => e.stopPropagation()}>
        <div className="celebration-emoji">🎉</div>
        <h2>Target Reached!</h2>
        <div className="celebration-site">
          <SiteAvatar site={site} size={28} radius={8} />
          <span>{site.name}</span>
        </div>
        <p>You hit your goal of <strong>{target} articles</strong>. Nice work!</p>
        <div className="celebration-actions">
          <button className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
          <button className="btn btn-primary btn-sm" onClick={onSetNewTarget}>Set a New Target</button>
        </div>
      </div>
    </div>
  )
}
