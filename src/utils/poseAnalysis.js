// Squat form analysis logic
export const analyzeSquat = (keypoints) => {
  const feedback = [];
  let score = 100;

  // Get keypoints
  const leftHip = keypoints[11];
  const rightHip = keypoints[12];
  const leftKnee = keypoints[13];
  const rightKnee = keypoints[14];
  const leftAnkle = keypoints[15];
  const rightAnkle = keypoints[16];
  const leftShoulder = keypoints[5];
  const rightShoulder = keypoints[6];

  // Check if we have all required keypoints
  if (!leftHip || !rightHip || !leftKnee || !rightKnee) {
    return { feedback: ['Move into camera view'], score: 0 };
  }

  // Calculate angles
  const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
  const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

  // 1. Squat Depth Analysis
  if (leftKneeAngle < 90 && rightKneeAngle < 90) {
    feedback.push({ message: '✅ Great depth!', type: 'good' });
  } else if (leftKneeAngle < 120 || rightKneeAngle < 120) {
    feedback.push({ message: '⚠️ Go deeper - aim for 90° knee bend', type: 'warning' });
    score -= 20;
  } else {
    feedback.push({ message: '❌ Not deep enough - bend those knees!', type: 'error' });
    score -= 30;
  }

  // 2. Knee Alignment (check for knee valgus)
  const kneeAlignment = checkKneeAlignment(leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle);
  if (kneeAlignment.isGood) {
    feedback.push({ message: '✅ Knees aligned with feet', type: 'good' });
  } else {
    feedback.push({ message: `⚠️ ${kneeAlignment.message}`, type: 'warning' });
    score -= 15;
  }

  // 3. Back Straightness
  const backAngle = calculateBackAngle(leftShoulder, rightShoulder, leftHip, rightHip);
  if (backAngle > 10) {
    feedback.push({ message: '⚠️ Keep your back straight - chest up!', type: 'warning' });
    score -= 10;
  } else {
    feedback.push({ message: '✅ Good back position', type: 'good' });
  }

  return { feedback, score: Math.max(score, 0) };
};

// Calculate angle between three points
const calculateAngle = (a, b, c) => {
  if (!a || !b || !c || a.score < 0.3 || b.score < 0.3 || c.score < 0.3) return 180;
  
  const ab = [b.x - a.x, b.y - a.y];
  const bc = [c.x - b.x, c.y - b.y];
  
  const dotProduct = ab[0] * bc[0] + ab[1] * bc[1];
  const magAB = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
  const magBC = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1]);
  
  const angleRad = Math.acos(dotProduct / (magAB * magBC));
  return angleRad * (180 / Math.PI);
};

// Check if knees are tracking properly over feet
const checkKneeAlignment = (leftHip, leftKnee, leftAnkle, rightHip, rightKnee, rightAnkle) => {
  if (!leftHip || !leftKnee || !leftAnkle || !rightHip || !rightKnee || !rightAnkle) {
    return { isGood: false, message: 'Cannot detect knee alignment' };
  }

  // Simple check: knee should be roughly above ankle
  const leftKneeOverAnkle = Math.abs(leftKnee.x - leftAnkle.x) < 0.1;
  const rightKneeOverAnkle = Math.abs(rightKnee.x - rightAnkle.x) < 0.1;

  if (leftKneeOverAnkle && rightKneeOverAnkle) {
    return { isGood: true, message: '' };
  } else if (!leftKneeOverAnkle && !rightKneeOverAnkle) {
    return { isGood: false, message: 'Push knees out over toes' };
  } else if (!leftKneeOverAnkle) {
    return { isGood: false, message: 'Push left knee out' };
  } else {
    return { isGood: false, message: 'Push right knee out' };
  }
};

// Calculate back angle (simplified)
const calculateBackAngle = (leftShoulder, rightShoulder, leftHip, rightHip) => {
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0;
  
  const shoulderAvgY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipAvgY = (leftHip.y + rightHip.y) / 2;
  
  return Math.abs(shoulderAvgY - hipAvgY) * 100;
};