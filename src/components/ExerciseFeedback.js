import React from 'react';
import './ExerciseFeedback.css';

const ExerciseFeedback = ({ feedback, currentExercise, score, reps, debugInfo, keypointsCount }) => {
  const getExerciseTitle = () => {
    switch (currentExercise) {
      case 'squat': return '🏋️ Squat Analysis';
      case 'pushup': return '💪 Push-up Analysis';
      default: return '🎯 Exercise Analysis';
    }
  };

  const getExerciseTips = () => {
    switch (currentExercise) {
      case 'squat':
        return [
          'Keep chest up and back straight',
          'Bend knees to at least 90°',
          'Keep knees aligned with toes',
          'Push through heels to stand',
          'Sit back like sitting in a chair'
        ];
      case 'pushup':
        return [
          'Keep body straight as a plank',
          'Lower chest until elbows at 90°',
          'Keep elbows at 45° angle',
          'Engage core throughout movement',
          'Maintain straight line head to heels'
        ];
      default:
        return [
          'Stand 2-3 meters from camera',
          'Ensure good lighting',
          'Full body should be visible'
        ];
    }
  };

  const getScoreColor = () => {
    if (score >= 90) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 50) return 'score-average';
    return 'score-poor';
  };

  return (
    <div className="feedback-panel">
      <h3 className="panel-title">{getExerciseTitle()}</h3>
      
      <div className="score-display">
        <div className={`stat-item score-circle ${getScoreColor()}`}>
          <span className="stat-value">{score}</span>
          <span className="stat-label">SCORE</span>
          <div className="score-quality">
            {score >= 90 ? 'EXCELLENT' : score >= 70 ? 'GOOD' : score >= 50 ? 'AVERAGE' : 'NEEDS WORK'}
          </div>
        </div>
        <div className="stat-item reps-counter">
          <span className="stat-value">{reps}</span>
          <span className="stat-label">REPS</span>
        </div>
        <div className="stat-item points-counter">
          <span className="stat-value">{keypointsCount}</span>
          <span className="stat-label">BODY POINTS</span>
        </div>
      </div>

      <div className="feedback-messages">
        <h4 className="section-title">🎯 Live Form Feedback</h4>
        <div className="debug-info">
          <strong>AI Status:</strong> {debugInfo}
        </div>
        <div className="feedback-list">
          {feedback.length > 0 ? (
            feedback.map((item, index) => (
              <div key={index} className={`feedback-item ${item.type}`}>
                <span className="feedback-icon">
                  {item.type === 'good' ? '✅' : item.type === 'warning' ? '⚠️' : item.type === 'error' ? '❌' : '💡'}
                </span>
                <span className="feedback-text">{item.message}</span>
              </div>
            ))
          ) : (
            <div className="feedback-item info">
              <span className="feedback-icon">🎯</span>
              <span className="feedback-text">Assume {currentExercise} position to get real-time feedback</span>
            </div>
          )}
        </div>
      </div>

      <div className="exercise-tips">
        <h4 className="section-title">💡 {currentExercise.charAt(0).toUpperCase() + currentExercise.slice(1)} Tips</h4>
        <ul className="tips-list">
          {getExerciseTips().map((tip, index) => (
            <li key={index}>{tip}</li>
          ))}
        </ul>
      </div>

      <div className="performance-guide">
        <h4 className="section-title">📊 Performance Guide</h4>
        <div className="guide-items">
          <div className="guide-item">
            <span className="guide-dot excellent"></span>
            <span>90-100: Excellent Form</span>
          </div>
          <div className="guide-item">
            <span className="guide-dot good"></span>
            <span>70-89: Good - Minor Adjustments</span>
          </div>
          <div className="guide-item">
            <span className="guide-dot average"></span>
            <span>50-69: Needs Improvement</span>
          </div>
          <div className="guide-item">
            <span className="guide-dot poor"></span>
            <span>0-49: Major Corrections Needed</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExerciseFeedback;