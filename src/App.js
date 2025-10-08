import React, { useRef, useEffect, useState } from 'react';

function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [poseDetector, setPoseDetector] = useState(null);
  const [debugInfo, setDebugInfo] = useState('Select an exercise and click Start');
  const [keypointsCount, setKeypointsCount] = useState(0);
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [exerciseState, setExerciseState] = useState('up');
  const [repCount, setRepCount] = useState(0);
  const [feedback, setFeedback] = useState([]);
  const [formScore, setFormScore] = useState(0);
  const [isInPosition, setIsInPosition] = useState(false);
  const animationFrameRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastStateRef = useRef('up');
  const stateTransitionTimeRef = useRef(Date.now());

  const exercises = {
    squat: { name: 'Squats', icon: '🏋️', description: 'Lower body strength' },
    pushup: { name: 'Push-ups', icon: '💪', description: 'Upper body & core' },
    bicepCurl: { name: 'Bicep Curls', icon: '💪', description: 'Arm strength' },
    shoulderPress: { name: 'Shoulder Press', icon: '🏋️', description: 'Shoulder & triceps' },
    plank: { name: 'Plank Hold', icon: '🧘', description: 'Core stability' },
  };

  useEffect(() => {
    initializePoseDetection();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const initializePoseDetection = async () => {
    try {
      setDebugInfo('Loading AI pose detection model...');
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const poseDetection = await import('@tensorflow-models/pose-detection');
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      setPoseDetector(detector);
      setDebugInfo('✅ AI Model Ready! Select exercise and start camera.');
    } catch (error) {
      setDebugInfo('❌ Error loading AI model');
      console.error('Error:', error);
    }
  };

  const startCamera = async () => {
    try {
      setDebugInfo('Requesting camera access...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsCameraActive(true);
          isDetectingRef.current = true;
          setDebugInfo(`✅ Camera active! Perform ${exercises[selectedExercise].name}...`);
          setTimeout(() => detectPoses(), 500);
        };
      }
    } catch (error) {
      setDebugInfo('❌ Camera access denied');
      alert('Cannot access camera. Please allow camera permissions.');
    }
  };

  const calculateAngle = (a, b, c) => {
    if (!a || !b || !c || a.score < 0.3 || b.score < 0.3 || c.score < 0.3) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  const analyzeSquat = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    const leftHip = keypoints[11], rightHip = keypoints[12];
    const leftKnee = keypoints[13], rightKnee = keypoints[14];
    const leftAnkle = keypoints[15], rightAnkle = keypoints[16];
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const nose = keypoints[0];

    const criticalPoints = [leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle];
    if (!criticalPoints.every(p => p && p.score > 0.3)) {
      newFeedback.push({ message: '⚠️ Move into frame - show full body', type: 'warning', priority: 1 });
      setIsInPosition(false);
      return { feedback: newFeedback, score: 0, state: 'up' };
    }

    setIsInPosition(true);
    const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const avgKneeY = (leftKnee.y + rightKnee.y) / 2;
    const hipKneeDistance = avgKneeY - avgHipY;

    let state = 'up';
    if (avgKneeAngle < 100) {
      state = 'down';
      if (hipKneeDistance > 0) {
        newFeedback.push({ message: '🎯 EXCELLENT! Hips below parallel - perfect depth', type: 'good', priority: 1 });
      } else if (avgKneeAngle < 90) {
        newFeedback.push({ message: '✅ Great depth! Keep going', type: 'good', priority: 1 });
      } else {
        newFeedback.push({ message: '✅ Good squat position', type: 'good', priority: 1 });
      }
    } else if (avgKneeAngle < 140) {
      newFeedback.push({ message: '⚠️ GO DEEPER - aim for 90° knee bend', type: 'warning', priority: 1 });
      score -= 25;
    } else {
      newFeedback.push({ message: '💡 Begin your squat - bend those knees', type: 'info', priority: 1 });
    }

    const kneeWidth = Math.abs(leftKnee.x - rightKnee.x);
    const ankleWidth = Math.abs(leftAnkle.x - rightAnkle.x);
    if (state === 'down' && kneeWidth < ankleWidth * 0.8) {
      newFeedback.push({ message: '❌ KNEES CAVING IN - push them outward!', type: 'error', priority: 2 });
      score -= 20;
    } else if (state === 'down') {
      newFeedback.push({ message: '✅ Perfect knee tracking', type: 'good', priority: 2 });
    }

    if (leftShoulder && rightShoulder && nose && leftShoulder.score > 0.3 && rightShoulder.score > 0.3 && nose.score > 0.3) {
      const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      const headForward = Math.abs(nose.x - avgShoulderX);
      if (headForward > 60) {
        newFeedback.push({ message: '❌ CHEST UP! You\'re leaning too far forward', type: 'error', priority: 3 });
        score -= 20;
      } else if (headForward > 40) {
        newFeedback.push({ message: '⚠️ Keep chest more upright', type: 'warning', priority: 3 });
        score -= 10;
      } else {
        newFeedback.push({ message: '✅ Perfect posture - chest up, back straight', type: 'good', priority: 3 });
      }
    }

    const leftKneeForward = Math.abs(leftKnee.x - leftAnkle.x);
    const rightKneeForward = Math.abs(rightKnee.x - rightAnkle.x);
    if (state === 'down' && (leftKneeForward > 70 || rightKneeForward > 70)) {
      newFeedback.push({ message: '⚠️ Knees too far forward - sit back more', type: 'warning', priority: 4 });
      score -= 15;
    }

    newFeedback.push({ message: `📐 Knee Angle: ${Math.round(avgKneeAngle)}° | Target: <100° for deep squat`, type: 'info', priority: 5 });
    if (state === 'down') {
      newFeedback.push({ message: `🔥 Hold this position - you're in the squat!`, type: 'info', priority: 6 });
    }

    newFeedback.sort((a, b) => a.priority - b.priority);
    return { feedback: newFeedback, score: Math.max(0, score), state };
  };

  const analyzePushup = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const leftElbow = keypoints[7], rightElbow = keypoints[8];
    const leftWrist = keypoints[9], rightWrist = keypoints[10];
    const leftHip = keypoints[11], rightHip = keypoints[12];
    const leftKnee = keypoints[13], rightKnee = keypoints[14];

    const criticalPoints = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist, leftHip, rightHip];
    if (!criticalPoints.every(p => p && p.score > 0.3)) {
      newFeedback.push({ message: '⚠️ Get into push-up position (plank)', type: 'warning', priority: 1 });
      setIsInPosition(false);
      return { feedback: newFeedback, score: 0, state: 'up' };
    }

    setIsInPosition(true);
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const shoulderHipDiff = avgHipY - avgShoulderY;

    let state = 'up';
    if (avgElbowAngle < 100) {
      state = 'down';
      newFeedback.push({ message: '🎯 EXCELLENT! Perfect push-up depth', type: 'good', priority: 1 });
    } else if (avgElbowAngle < 140) {
      newFeedback.push({ message: '⚠️ GO LOWER - bend elbows to 90°', type: 'warning', priority: 1 });
      score -= 20;
    } else {
      newFeedback.push({ message: '💡 Lower your chest toward the ground', type: 'info', priority: 1 });
    }

    if (shoulderHipDiff > 50) {
      newFeedback.push({ message: '❌ HIPS SAGGING! Engage your core', type: 'error', priority: 2 });
      score -= 25;
    } else if (shoulderHipDiff < -50) {
      newFeedback.push({ message: '❌ HIPS TOO HIGH! Lower them down', type: 'error', priority: 2 });
      score -= 20;
    } else {
      newFeedback.push({ message: '✅ Perfect body alignment - straight line', type: 'good', priority: 2 });
    }

    const elbowWidth = Math.abs(leftElbow.x - rightElbow.x);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    if (elbowWidth > shoulderWidth * 1.4) {
      newFeedback.push({ message: '⚠️ Elbows flaring out - keep them at 45°', type: 'warning', priority: 3 });
      score -= 15;
    } else {
      newFeedback.push({ message: '✅ Good elbow position', type: 'good', priority: 3 });
    }

    newFeedback.push({ message: `📐 Elbow Angle: ${Math.round(avgElbowAngle)}° | Target: <100° at bottom`, type: 'info', priority: 5 });
    if (state === 'down') {
      newFeedback.push({ message: '🔥 Great! Now push back up', type: 'info', priority: 6 });
    }

    newFeedback.sort((a, b) => a.priority - b.priority);
    return { feedback: newFeedback, score: Math.max(0, score), state };
  };

  const analyzeBicepCurl = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const leftElbow = keypoints[7], rightElbow = keypoints[8];
    const leftWrist = keypoints[9], rightWrist = keypoints[10];
    const leftHip = keypoints[11], rightHip = keypoints[12];

    const criticalPoints = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist];
    if (!criticalPoints.every(p => p && p.score > 0.3)) {
      newFeedback.push({ message: '⚠️ Show upper body - arms visible', type: 'warning', priority: 1 });
      setIsInPosition(false);
      return { feedback: newFeedback, score: 0, state: 'down' };
    }

    setIsInPosition(true);
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    let state = 'down';
    if (avgElbowAngle < 50) {
      state = 'up';
      newFeedback.push({ message: '🎯 PERFECT! Full bicep contraction at top', type: 'good', priority: 1 });
    } else if (avgElbowAngle < 90) {
      newFeedback.push({ message: '⚠️ CURL HIGHER - bring to shoulders', type: 'warning', priority: 1 });
      score -= 15;
    } else if (avgElbowAngle > 160) {
      newFeedback.push({ message: '✅ Good starting position - arms extended', type: 'good', priority: 1 });
    } else {
      newFeedback.push({ message: '💡 Either curl up or extend down fully', type: 'info', priority: 1 });
    }

    const avgElbowY = (leftElbow.y + rightElbow.y) / 2;
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;
    const elbowPosition = (avgElbowY - avgShoulderY) / (avgHipY - avgShoulderY);
    
    if (elbowPosition < 0.3 || elbowPosition > 0.7) {
      newFeedback.push({ message: '❌ ELBOWS MOVING! Keep them locked at sides', type: 'error', priority: 2 });
      score -= 25;
    } else {
      newFeedback.push({ message: '✅ Perfect - elbows stable at sides', type: 'good', priority: 2 });
    }

    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    if (avgWristY < avgShoulderY && avgElbowAngle < 50) {
      newFeedback.push({ message: '⚠️ Don\'t swing the weight - control it', type: 'warning', priority: 3 });
      score -= 15;
    }

    newFeedback.push({ message: `📐 Elbow Angle: ${Math.round(avgElbowAngle)}° | Full curl: <50°`, type: 'info', priority: 5 });
    newFeedback.sort((a, b) => a.priority - b.priority);
    return { feedback: newFeedback, score: Math.max(0, score), state };
  };

  const analyzeShoulderPress = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const leftElbow = keypoints[7], rightElbow = keypoints[8];
    const leftWrist = keypoints[9], rightWrist = keypoints[10];

    const criticalPoints = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist];
    if (!criticalPoints.every(p => p && p.score > 0.3)) {
      newFeedback.push({ message: '⚠️ Show upper body clearly', type: 'warning', priority: 1 });
      setIsInPosition(false);
      return { feedback: newFeedback, score: 0, state: 'down' };
    }

    setIsInPosition(true);
    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
    const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

    let state = 'down';
    if (avgWristY < avgShoulderY - 100 && avgElbowAngle > 160) {
      state = 'up';
      newFeedback.push({ message: '🎯 PERFECT! Full overhead extension', type: 'good', priority: 1 });
    } else if (avgWristY < avgShoulderY - 50) {
      newFeedback.push({ message: '⚠️ PRESS HIGHER - full extension', type: 'warning', priority: 1 });
      score -= 20;
    } else {
      newFeedback.push({ message: '💡 Press weights overhead', type: 'info', priority: 1 });
    }

    const wristWidth = Math.abs(leftWrist.x - rightWrist.x);
    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    if (Math.abs(wristWidth - shoulderWidth) > 40) {
      newFeedback.push({ message: '⚠️ Keep wrists shoulder-width apart', type: 'warning', priority: 2 });
      score -= 15;
    } else {
      newFeedback.push({ message: '✅ Perfect wrist alignment', type: 'good', priority: 2 });
    }

    newFeedback.push({ message: `📐 Elbow Angle: ${Math.round(avgElbowAngle)}° | Full press: >160°`, type: 'info', priority: 5 });
    newFeedback.sort((a, b) => a.priority - b.priority);
    return { feedback: newFeedback, score: Math.max(0, score), state };
  };

  const analyzePlank = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const leftElbow = keypoints[7], rightElbow = keypoints[8];
    const leftHip = keypoints[11], rightHip = keypoints[12];

    const criticalPoints = [leftShoulder, rightShoulder, leftHip, rightHip];
    if (!criticalPoints.every(p => p && p.score > 0.3)) {
      newFeedback.push({ message: '⚠️ Get into plank position', type: 'warning', priority: 1 });
      setIsInPosition(false);
      return { feedback: newFeedback, score: 0, state: 'holding' };
    }

    setIsInPosition(true);
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const avgHipY = (leftHip.y + rightHip.y) / 2;

    if (avgHipY > avgShoulderY + 60) {
      newFeedback.push({ message: '❌ HIPS SAGGING! Lift them up - engage core', type: 'error', priority: 1 });
      score -= 30;
    } else if (avgHipY < avgShoulderY - 60) {
      newFeedback.push({ message: '❌ HIPS TOO HIGH! Lower them down', type: 'error', priority: 1 });
      score -= 25;
    } else if (Math.abs(avgHipY - avgShoulderY) < 20) {
      newFeedback.push({ message: '🎯 PERFECT PLANK! Body in straight line', type: 'good', priority: 1 });
    } else {
      newFeedback.push({ message: '✅ Good plank position', type: 'good', priority: 1 });
    }

    if (leftElbow && rightElbow) {
      const avgElbowX = (leftElbow.x + rightElbow.x) / 2;
      const avgShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
      if (Math.abs(avgElbowX - avgShoulderX) < 30) {
        newFeedback.push({ message: '✅ Shoulders directly over elbows', type: 'good', priority: 2 });
      } else {
        newFeedback.push({ message: '⚠️ Align shoulders over elbows', type: 'warning', priority: 2 });
        score -= 15;
      }
    }

    newFeedback.push({ message: '💪 Keep core tight - breathe steadily', type: 'info', priority: 3 });
    newFeedback.push({ message: '🔥 Hold this position - you\'re doing great!', type: 'info', priority: 4 });

    newFeedback.sort((a, b) => a.priority - b.priority);
    return { feedback: newFeedback, score: Math.max(0, score), state: 'holding' };
  };

  const analyzeExercise = (keypoints) => {
    switch (selectedExercise) {
      case 'squat': return analyzeSquat(keypoints);
      case 'pushup': return analyzePushup(keypoints);
      case 'bicepCurl': return analyzeBicepCurl(keypoints);
      case 'shoulderPress': return analyzeShoulderPress(keypoints);
      case 'plank': return analyzePlank(keypoints);
      default: return { feedback: [], score: 0, state: 'up' };
    }
  };

  const detectPoses = async () => {
    if (!poseDetector || !videoRef.current || !isDetectingRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(detectPoses);
      return;
    }

    try {
      const poses = await poseDetector.estimatePoses(video, { flipHorizontal: false });
      if (poses && poses.length > 0) {
        const visibleKeypoints = poses[0].keypoints.filter(kp => kp.score > 0.3).length;
        setKeypointsCount(visibleKeypoints);
        const analysis = analyzeExercise(poses[0].keypoints);

        const currentTime = Date.now();
        if (analysis.state !== lastStateRef.current && (currentTime - stateTransitionTimeRef.current) > 500) {
          if (selectedExercise !== 'plank') {
            const shouldCount = 
              (selectedExercise === 'squat' && analysis.state === 'up' && lastStateRef.current === 'down') ||
              (selectedExercise === 'pushup' && analysis.state === 'up' && lastStateRef.current === 'down') ||
              (selectedExercise === 'bicepCurl' && analysis.state === 'down' && lastStateRef.current === 'up') ||
              (selectedExercise === 'shoulderPress' && analysis.state === 'down' && lastStateRef.current === 'up');
            
            if (shouldCount) {
              setRepCount(prev => prev + 1);
              analysis.feedback.unshift({ message: '🎉 REP COMPLETED! Great work!', type: 'good', priority: 0 });
            }
          }
          lastStateRef.current = analysis.state;
          stateTransitionTimeRef.current = currentTime;
        }

        setExerciseState(analysis.state);
        setFeedback(analysis.feedback);
        setFormScore(analysis.score);
        setDebugInfo(`✅ Tracking ${visibleKeypoints}/17 body points`);
      } else {
        setKeypointsCount(0);
        setIsInPosition(false);
        setDebugInfo('⚠️ No person detected - step into frame');
        setFeedback([{ message: '⚠️ No person detected in frame', type: 'warning', priority: 1 }]);
      }
      drawSkeleton(poses);
    } catch (error) {
      console.error('Detection error:', error);
    }
    animationFrameRef.current = requestAnimationFrame(detectPoses);
  };

  const drawSkeleton = (poses) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.readyState !== 4) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!poses || !poses.length) return;

    const pose = poses[0];
    if (!pose || !pose.keypoints) return;

    const connections = [
      [0, 1], [0, 2], [1, 3], [2, 4], [5, 6],
      [5, 7], [7, 9], [6, 8], [8, 10],
      [5, 11], [6, 12], [11, 12],
      [11, 13], [13, 15], [12, 14], [14, 16]
    ];

    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    connections.forEach(([startIdx, endIdx]) => {
      const start = pose.keypoints[startIdx];
      const end = pose.keypoints[endIdx];
      if (start && end && start.score > 0.3 && end.score > 0.3) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });

    let criticalJoints = [];
    if (selectedExercise === 'squat') criticalJoints = [11, 12, 13, 14, 15, 16];
    else if (selectedExercise === 'pushup') criticalJoints = [5, 6, 7, 8, 9, 10, 11, 12];
    else if (selectedExercise === 'bicepCurl') criticalJoints = [5, 6, 7, 8, 9, 10];
    else if (selectedExercise === 'shoulderPress') criticalJoints = [5, 6, 7, 8, 9, 10];
    else if (selectedExercise === 'plank') criticalJoints = [5, 6, 7, 8, 11, 12, 15, 16];

    pose.keypoints.forEach((keypoint, idx) => {
      if (keypoint.score > 0.3) {
        const isCritical = criticalJoints.includes(idx);
        ctx.beginPath();
        ctx.arc(keypoint.x, keypoint.y, isCritical ? 10 : 7, 0, 2 * Math.PI);
        ctx.fillStyle = isCritical ? '#FF0080' : '#00D9FF';
        ctx.fill();
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  };

  const stopCamera = () => {
    isDetectingRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setIsCameraActive(false);
    setIsInPosition(false);
    setDebugInfo('Camera stopped. Select exercise and click Start.');
    setKeypointsCount(0);
    setFeedback([]);
  };

  const resetStats = () => {
    setRepCount(0);
    setFormScore(0);
    lastStateRef.current = 'up';
    setFeedback([]);
  };

  const handleExerciseChange = (exercise) => {
    setSelectedExercise(exercise);
    resetStats();
    if (isCameraActive) {
      setDebugInfo(`✅ Switched to ${exercises[exercise].name}`);
    }
  };

  const getScoreColor = () => {
    if (formScore >= 90) return '#48bb78';
    if (formScore >= 70) return '#ed8936';
    if (formScore >= 50) return '#ecc94b';
    return '#f56565';
  };

  const getScoreLabel = () => {
    if (formScore >= 90) return 'EXCELLENT';
    if (formScore >= 70) return 'GOOD';
    if (formScore >= 50) return 'AVERAGE';
    return 'NEEDS WORK';
  };

  const getExerciseTips = () => {
    const tips = {
      squat: [
        '🎯 Lower until hips at or below knee level',
        '👣 Push knees out, track over toes',
        '💪 Keep chest up, back straight',
        '⚖️ Weight evenly through full foot',
        '📐 Aim for 90° knee bend or deeper',
      ],
      pushup: [
        '📏 Body in straight line - no sagging',
        '💪 Lower until chest nearly touches ground',
        '🔄 Elbows at 45° angle to body',
        '🎯 Engage core throughout',
        '👀 Look slightly forward, not down',
      ],
      bicepCurl: [
        '📌 Keep elbows locked at your sides',
        '🔝 Curl all the way to shoulders',
        '⚡ Control movement - no swinging',
        '📐 Full extension at bottom',
        '💪 Squeeze biceps at top',
      ],
      shoulderPress: [
        '🔝 Press directly overhead',
        '💪 Keep core tight and stable',
        '📏 Wrists shoulder-width apart',
        '🎯 Full arm extension at top',
        '⬇️ Lower to shoulder level',
      ],
      plank: [
        '📏 Body straight - shoulders to ankles',
        '🎯 Shoulders directly over elbows',
        '💪 Engage core and squeeze glutes',
        '😮‍💨 Breathe steadily - don\'t hold breath',
        '👀 Look down to keep neck neutral',
      ],
    };
    return tips[selectedExercise] || [];
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <h1 style={styles.title}>🏋️ FormFit AI</h1>
        <p style={styles.subtitle}>Real-Time Exercise Form Correction with AI</p>
      </header>

      <div style={styles.mainContainer}>
        {/* Exercise Selection */}
        <div style={styles.exerciseSelector}>
          <h3 style={styles.selectorTitle}>Select Your Exercise:</h3>
          <div style={styles.exerciseGrid}>
            {Object.keys(exercises).map((key) => (
              <button
                key={key}
                onClick={() => handleExerciseChange(key)}
                style={{
                  ...styles.exerciseCard,
                  ...(selectedExercise === key ? styles.exerciseCardActive : {})
                }}
              >
                <span style={styles.exerciseIcon}>{exercises[key].icon}</span>
                <span style={styles.exerciseName}>{exercises[key].name}</span>
                <span style={styles.exerciseDesc}>{exercises[key].description}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.workoutSection}>
          {/* Camera Section */}
          <div style={styles.cameraSection}>
            <div style={styles.videoWrapper}>
              <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
              <canvas ref={canvasRef} style={styles.canvas} />
              
              {/* Status Overlays */}
              {isCameraActive && isInPosition && (
                <div style={styles.statusBadge}>
                  <span style={styles.statusDot}></span>
                  {exerciseState === 'down' && selectedExercise === 'squat' && 'IN SQUAT'}
                  {exerciseState === 'down' && selectedExercise === 'pushup' && 'LOWERED'}
                  {exerciseState === 'up' && selectedExercise === 'bicepCurl' && 'CURLED'}
                  {exerciseState === 'up' && selectedExercise === 'shoulderPress' && 'PRESSED'}
                  {exerciseState === 'holding' && selectedExercise === 'plank' && 'HOLDING'}
                </div>
              )}
              
              {isCameraActive && !isInPosition && (
                <div style={{...styles.statusBadge, background: 'rgba(237, 137, 54, 0.9)'}}>
                  ⚠️ POSITION YOURSELF
                </div>
              )}
            </div>

            <div style={styles.controls}>
              {!isCameraActive ? (
                <button onClick={startCamera} style={{...styles.button, ...styles.startBtn}}>
                  🎥 Start Camera & AI Detection
                </button>
              ) : (
                <div style={styles.controlsActive}>
                  <button onClick={stopCamera} style={{...styles.button, ...styles.stopBtn}}>
                    ⏹️ Stop
                  </button>
                  <button onClick={resetStats} style={{...styles.button, ...styles.resetBtn}}>
                    🔄 Reset
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Feedback Panel */}
          <div style={styles.feedbackPanel}>
            <h3 style={styles.panelTitle}>
              {exercises[selectedExercise].icon} {exercises[selectedExercise].name} Analysis
            </h3>
            
            {/* Stats Display */}
            <div style={styles.statsGrid}>
              <div style={{...styles.statCard, background: `linear-gradient(135deg, ${getScoreColor()} 0%, ${getScoreColor()}dd 100%)`}}>
                <span style={styles.statValue}>{formScore}</span>
                <span style={styles.statLabel}>FORM SCORE</span>
                <span style={styles.scoreQuality}>{getScoreLabel()}</span>
              </div>
              
              {selectedExercise !== 'plank' ? (
                <div style={{...styles.statCard, background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'}}>
                  <span style={styles.statValue}>{repCount}</span>
                  <span style={styles.statLabel}>REPS</span>
                </div>
              ) : (
                <div style={{...styles.statCard, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'}}>
                  <span style={styles.statValue}>⏱️</span>
                  <span style={styles.statLabel}>HOLD TIME</span>
                </div>
              )}
              
              <div style={{...styles.statCard, background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)'}}>
                <span style={styles.statValue}>{keypointsCount}</span>
                <span style={styles.statLabel}>TRACKED</span>
              </div>
            </div>

            {/* Live Feedback */}
            <div style={styles.feedbackSection}>
              <h4 style={styles.sectionTitle}>🎯 Live Form Feedback</h4>
              <div style={styles.debugInfo}>
                <strong>Status:</strong> {debugInfo}
              </div>
              <div style={styles.feedbackList}>
                {feedback.length > 0 ? (
                  feedback.map((item, index) => (
                    <div key={index} style={{...styles.feedbackItem, ...styles[item.type]}}>
                      {item.message}
                    </div>
                  ))
                ) : (
                  <div style={{...styles.feedbackItem, ...styles.info}}>
                    💡 Start exercising to receive real-time feedback
                  </div>
                )}
              </div>
            </div>

            {/* Exercise Tips */}
            <div style={styles.tipsSection}>
              <h4 style={styles.sectionTitle}>💡 Form Tips</h4>
              <ul style={styles.tipsList}>
                {getExerciseTips().map((tip, index) => (
                  <li key={index} style={styles.tipItem}>{tip}</li>
                ))}
              </ul>
            </div>

            {/* Performance Guide */}
            <div style={styles.guideSection}>
              <h4 style={styles.sectionTitle}>📊 Score Guide</h4>
              <div style={styles.guideGrid}>
                <div style={styles.guideItem}>
                  <span style={{...styles.guideDot, background: '#48bb78'}}></span>
                  <span style={styles.guideText}>90-100: Excellent Form</span>
                </div>
                <div style={styles.guideItem}>
                  <span style={{...styles.guideDot, background: '#ed8936'}}></span>
                  <span style={styles.guideText}>70-89: Good - Minor Fixes</span>
                </div>
                <div style={styles.guideItem}>
                  <span style={{...styles.guideDot, background: '#ecc94b'}}></span>
                  <span style={styles.guideText}>50-69: Needs Improvement</span>
                </div>
                <div style={styles.guideItem}>
                  <span style={{...styles.guideDot, background: '#f56565'}}></span>
                  <span style={styles.guideText}>0-49: Major Corrections</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  app: {
    minHeight: '100vh',
    backgroundColor: '#0a0e27',
    color: '#fff',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    textAlign: 'center',
    padding: '2rem',
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  title: {
    margin: 0,
    fontSize: '2.5rem',
    fontWeight: 'bold',
  },
  subtitle: {
    margin: '0.5rem 0 0 0',
    fontSize: '1.1rem',
    opacity: 0.95,
  },
  mainContainer: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  exerciseSelector: {
    marginBottom: '2rem',
  },
  selectorTitle: {
    textAlign: 'center',
    fontSize: '1.3rem',
    marginBottom: '1rem',
    color: '#fff',
  },
  exerciseGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },
  exerciseCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '1rem',
    background: '#1a1f3a',
    border: '2px solid #2a2f4a',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    color: '#fff',
  },
  exerciseCardActive: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    borderColor: '#667eea',
    transform: 'scale(1.05)',
    boxShadow: '0 8px 24px rgba(102, 126, 234, 0.4)',
  },
  exerciseIcon: {
    fontSize: '2.5rem',
    marginBottom: '0.5rem',
  },
  exerciseName: {
    fontSize: '1rem',
    fontWeight: 'bold',
    marginBottom: '0.25rem',
  },
  exerciseDesc: {
    fontSize: '0.75rem',
    opacity: 0.8,
    textAlign: 'center',
  },
  workoutSection: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2rem',
  },
  cameraSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  videoWrapper: {
    position: 'relative',
    backgroundColor: '#1a1f3a',
    borderRadius: '12px',
    overflow: 'hidden',
    aspectRatio: '4/3',
    border: '2px solid #2a2f4a',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  canvas: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(255, 0, 128, 0.9)',
    color: '#fff',
    padding: '12px 24px',
    borderRadius: '25px',
    fontWeight: 'bold',
    fontSize: '1.1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
  },
  statusDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#fff',
    animation: 'pulse 1.5s infinite',
  },
  controls: {
    display: 'flex',
    justifyContent: 'center',
  },
  controlsActive: {
    display: 'flex',
    gap: '1rem',
    width: '100%',
  },
  button: {
    padding: '1rem 2rem',
    fontSize: '1.1rem',
    fontWeight: 'bold',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.3s',
    flex: 1,
  },
  startBtn: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: '#fff',
  },
  stopBtn: {
    background: '#e53e3e',
    color: '#fff',
  },
  resetBtn: {
    background: '#718096',
    color: '#fff',
  },
  feedbackPanel: {
    backgroundColor: '#1a1f3a',
    borderRadius: '12px',
    padding: '1.5rem',
    border: '1px solid #2a2f4a',
    maxHeight: '800px',
    overflowY: 'auto',
  },
  panelTitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.4rem',
    textAlign: 'center',
    borderBottom: '2px solid #667eea',
    paddingBottom: '0.5rem',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  statCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    borderRadius: '12px',
    minHeight: '100px',
    position: 'relative',
    boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
  },
  statValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: '0.7rem',
    opacity: 0.9,
    marginTop: '4px',
  },
  scoreQuality: {
    position: 'absolute',
    bottom: '8px',
    fontSize: '0.65rem',
    fontWeight: 'bold',
    background: 'rgba(0,0,0,0.3)',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  feedbackSection: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    margin: '0 0 1rem 0',
    fontSize: '1rem',
    borderLeft: '4px solid #667eea',
    paddingLeft: '0.5rem',
  },
  debugInfo: {
    padding: '0.75rem',
    background: '#0a0e27',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    color: '#00ff00',
    fontFamily: 'monospace',
  },
  feedbackList: {
    maxHeight: '250px',
    overflowY: 'auto',
  },
  feedbackItem: {
    padding: '0.75rem',
    borderRadius: '6px',
    marginBottom: '0.5rem',
    borderLeft: '4px solid',
    fontSize: '0.9rem',
  },
  good: {
    background: 'rgba(72, 187, 120, 0.15)',
    borderLeftColor: '#48bb78',
    color: '#48bb78',
  },
  warning: {
    background: 'rgba(237, 137, 54, 0.15)',
    borderLeftColor: '#ed8936',
    color: '#ed8936',
  },
  error: {
    background: 'rgba(245, 101, 101, 0.15)',
    borderLeftColor: '#f56565',
    color: '#f56565',
  },
  info: {
    background: 'rgba(66, 153, 225, 0.15)',
    borderLeftColor: '#4299e1',
    color: '#4299e1',
  },
  tipsSection: {
    background: '#0a0e27',
    padding: '1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  tipsList: {
    margin: '0.5rem 0 0 0',
    paddingLeft: '1.5rem',
    fontSize: '0.85rem',
    lineHeight: '1.8',
  },
  tipItem: {
    marginBottom: '0.5rem',
  },
  guideSection: {
    background: '#0a0e27',
    padding: '1rem',
    borderRadius: '6px',
  },
  guideGrid: {
    display: 'grid',
    gap: '0.5rem',
  },
  guideItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  guideDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
  },
  guideText: {
    fontSize: '0.85rem',
    color: '#cbd5e0',
  },
};

export default App;