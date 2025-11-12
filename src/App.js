import React, { useState, useRef, useEffect } from 'react';
import './App.css';
import { Camera, LogOut, User, TrendingUp, MessageSquare, Award, Calendar, Target, Dumbbell, Clock, Info, Menu } from 'lucide-react';

/**
 * FormFit Pro - Single-file app component (keeps your original structure)
 * - Fixed rep counting (state machine + cooldown)
 * - Minor robustness fixes for pose detection loop
 * - Uses CSS in App.css for layout (no Tailwind required)
 */

const App = () => {
  // ---- app state ----
  const [currentView, setCurrentView] = useState('login');
  const [user, setUser] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState('squat');
  const [poseDetector, setPoseDetector] = useState(null);
  const [currentReps, setCurrentReps] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [feedback, setFeedback] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [exerciseState, setExerciseState] = useState('ready');
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const [isInPosition, setIsInPosition] = useState(false);

  // refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isDetectingRef = useRef(false);
  const lastStateRef = useRef('up'); // track last state to detect transitions
  const repCooldownRef = useRef(0); // timestamp to avoid double-counts

  // sample exercise data (kept your original icons as emoji)
  const exercises = {
    squat: { name: 'Squats', icon: '🏋️', muscle: 'Legs & Glutes', difficulty: 'Beginner', calories: 8 },
    pushup: { name: 'Push-ups', icon: '💪', muscle: 'Chest & Triceps', difficulty: 'Beginner', calories: 7 },
    plank: { name: 'Plank Hold', icon: '🧘', muscle: 'Core', difficulty: 'Beginner', calories: 5 },
    bicepCurl: { name: 'Bicep Curls', icon: '💪', muscle: 'Biceps', difficulty: 'Beginner', calories: 6 },
    shoulderPress: { name: 'Shoulder Press', icon: '🏋️', muscle: 'Shoulders', difficulty: 'Intermediate', calories: 7 },
    lunges: { name: 'Lunges', icon: '🦵', muscle: 'Legs & Glutes', difficulty: 'Beginner', calories: 8 },
    tricepDips: { name: 'Tricep Dips', icon: '💪', muscle: 'Triceps', difficulty: 'Intermediate', calories: 7 },
    mountainClimbers: { name: 'Mountain Climbers', icon: '⛰️', muscle: 'Full Body', difficulty: 'Advanced', calories: 10 },
    burpees: { name: 'Burpees', icon: '🔥', muscle: 'Full Body', difficulty: 'Advanced', calories: 12 },
    jumpingJacks: { name: 'Jumping Jacks', icon: '🤸', muscle: 'Cardio', difficulty: 'Beginner', calories: 8 }
  };

  // load stored data + initialize model
  useEffect(() => {
    loadStoredData();
    initializePoseDetection();
    return () => {
      // cleanup animation frame
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStoredData = async () => {
    // try to read from window.storage (if available) otherwise skip
    try {
      if (window.storage && window.storage.get) {
        const userData = await window.storage.get('user');
        if (userData) {
          const parsedUser = JSON.parse(userData.value);
          setUser(parsedUser);
          setCurrentView('dashboard');
        }
        const historyData = await window.storage.get('workoutHistory');
        if (historyData) {
          setWorkoutHistory(JSON.parse(historyData.value));
        }
      } else {
        // no storage API found: skip silently
      }
    } catch (e) {
      // ignore if storage not present
      console.warn('Storage unavailable', e);
    }
  };

  const saveToStorage = async (key, data) => {
    try {
      if (window.storage && window.storage.set) {
        await window.storage.set(key, JSON.stringify(data));
      }
    } catch (error) {
      console.error('Storage error:', error);
    }
  };

  const initializePoseDetection = async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const poseDetection = await import('@tensorflow-models/pose-detection');
      // create MoveNet detector
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        // use SINGLEPOSE_LIGHTNING (fast). If you want higher accuracy use MULTIPOSE or different model.
        { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
      );
      setPoseDetector(detector);
      console.log('Pose detector ready');
    } catch (error) {
      console.error('Error loading model:', error);
    }
  };

  // simple login emulation
  const handleLogin = (email, password) => {
    const newUser = {
      id: Date.now(),
      email,
      name: email.split('@')[0],
      joinDate: new Date().toISOString(),
      totalWorkouts: 0,
      totalReps: 0,
      streak: 0
    };
    setUser(newUser);
    saveToStorage('user', newUser);
    setCurrentView('dashboard');
    setChatMessages([{
      type: 'bot',
      message: `Welcome ${newUser.name}! I'm your AI fitness coach. Ask me anything about exercises, form, or nutrition!`
    }]);
  };

  const handleLogout = () => {
    stopCamera();
    setUser(null);
    setCurrentView('login');
  };

  // camera start/stop
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setIsCameraActive(true);
          isDetectingRef.current = true;
          setSessionStartTime(Date.now());
          // reset states
          lastStateRef.current = 'up';
          repCooldownRef.current = 0;
          detectPoses();
        };
      }
    } catch (error) {
      alert('Camera access denied. Please allow camera permissions and reload the page.');
      console.error(error);
    }
  };

  const stopCamera = () => {
    isDetectingRef.current = false;
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsInPosition(false);

    if (currentReps > 0) {
      saveWorkoutSession();
    }
  };

  const saveWorkoutSession = () => {
    const duration = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
    const session = {
      id: Date.now(),
      exercise: exercises[selectedExercise].name,
      reps: currentReps,
      score: currentScore,
      duration,
      calories: Math.round((exercises[selectedExercise].calories * currentReps) / 10),
      date: new Date().toISOString()
    };

    const newHistory = [session, ...workoutHistory].slice(0, 50);
    setWorkoutHistory(newHistory);
    saveToStorage('workoutHistory', newHistory);

    if (user) {
      const updatedUser = {
        ...user,
        totalWorkouts: (user.totalWorkouts || 0) + 1,
        totalReps: (user.totalReps || 0) + currentReps
      };
      setUser(updatedUser);
      saveToStorage('user', updatedUser);
    }

    setCurrentReps(0);
    setCurrentScore(0);
    setSessionStartTime(null);
  };

  // helper: compute angle between 3 points
  const calculateAngle = (a, b, c) => {
    if (!a || !b || !c || (a.score !== undefined && a.score < 0.3) || (b.score !== undefined && b.score < 0.3) || (c.score !== undefined && c.score < 0.3)) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180) angle = 360 - angle;
    return angle;
  };

  // analyze exercise and return feedback + score + state (up/down)
  const analyzeExercise = (keypoints) => {
    const newFeedback = [];
    let score = 100;
    let state = 'up';

    // assign expected keypoints using indices:
    // MoveNet returns keypoints array with indices matching BODY_25-ish order; original used indexes 5..16
    const leftHip = keypoints[11], rightHip = keypoints[12];
    const leftKnee = keypoints[13], rightKnee = keypoints[14];
    const leftAnkle = keypoints[15], rightAnkle = keypoints[16];
    const leftShoulder = keypoints[5], rightShoulder = keypoints[6];
    const leftElbow = keypoints[7], rightElbow = keypoints[8];
    const leftWrist = keypoints[9], rightWrist = keypoints[10];

    switch (selectedExercise) {
      case 'squat': {
        const criticalSquat = [leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle];
        if (!criticalSquat.every(p => p && p.score > 0.25)) {
          newFeedback.push({ message: '⚠️ Move into frame - show full body', type: 'warning' });
          setIsInPosition(false);
          return { feedback: newFeedback, score: 0, state: 'up' };
        }
        setIsInPosition(true);

        // use knee angle (hip-knee-ankle) to decide down/up
        const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
        const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);
        const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

        // thresholds: below 100 -> deep squat (down)
        if (avgKneeAngle < 100) {
          state = 'down';
          newFeedback.push({ message: '🎯 PERFECT depth!', type: 'good' });
        } else if (avgKneeAngle < 140) {
          state = 'down';
          newFeedback.push({ message: '⚠️ GO DEEPER', type: 'warning' });
          score -= 25;
        } else {
          state = 'up';
        }
        break;
      }

      case 'pushup': {
        const criticalPushup = [leftShoulder, rightShoulder, leftElbow, rightElbow, leftWrist, rightWrist];
        if (!criticalPushup.every(p => p && p.score > 0.25)) {
          newFeedback.push({ message: '⚠️ Get into push-up position', type: 'warning' });
          setIsInPosition(false);
          return { feedback: newFeedback, score: 0, state: 'up' };
        }
        setIsInPosition(true);

        const leftElbowAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightElbowAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgElbowAngle = (leftElbowAngle + rightElbowAngle) / 2;

        if (avgElbowAngle < 100) {
          state = 'down';
          newFeedback.push({ message: '🎯 EXCELLENT depth!', type: 'good' });
        } else if (avgElbowAngle < 140) {
          state = 'down';
          newFeedback.push({ message: '⚠️ GO LOWER', type: 'warning' });
          score -= 20;
        } else {
          state = 'up';
        }
        break;
      }

      case 'bicepCurl': {
        const critical = [leftShoulder, leftElbow, leftWrist, rightShoulder, rightElbow, rightWrist];
        if (!critical.every(p => p && p.score > 0.25)) {
          newFeedback.push({ message: '⚠️ Show arms for curl tracking', type: 'warning' });
          setIsInPosition(false);
          return { feedback: newFeedback, score: 0, state: 'up' };
        }
        setIsInPosition(true);

        // Use elbow angle for curls (shoulder-elbow-wrist)
        const leftAngle = calculateAngle(leftShoulder, leftElbow, leftWrist);
        const rightAngle = calculateAngle(rightShoulder, rightElbow, rightWrist);
        const avgAngle = (leftAngle + rightAngle) / 2;

        if (avgAngle < 60) {
          state = 'down';
          newFeedback.push({ message: '🎯 FULL CONTRACTION!', type: 'good' });
        } else if (avgAngle < 120) {
          state = 'down';
          newFeedback.push({ message: '⚠️ Curl more', type: 'warning' });
        } else {
          state = 'up';
        }
        break;
      }

      default:
        newFeedback.push({ message: '💡 Exercise tracking active', type: 'info' });
    }

    return { feedback: newFeedback, score: Math.max(0, score), state };
  };

  // main detection loop
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
        const pose = poses[0];
        const analysis = analyzeExercise(pose.keypoints);

        // only register a rep on a full cycle and with cooldown (avoid multiple frames count)
        if (analysis.state !== lastStateRef.current) {
          // transition down -> up indicates a rep completed (for our logic we count when returning to 'up')
          if ((selectedExercise === 'squat' || selectedExercise === 'pushup' || selectedExercise === 'bicepCurl') &&
              analysis.state === 'up' && lastStateRef.current === 'down') {
            const now = Date.now();
            // cooldown: 700ms default. Prevents rapid multi-counting.
            if (now - repCooldownRef.current > 700) {
              setCurrentReps(prev => prev + 1);
              repCooldownRef.current = now;
            }
          }
          lastStateRef.current = analysis.state;
        }

        setExerciseState(analysis.state);
        setFeedback(analysis.feedback);
        setCurrentScore(Math.round(analysis.score));
        drawSkeleton([pose]);
      } else {
        setIsInPosition(false);
        setFeedback([{ message: '⚠️ No person detected', type: 'warning' }]);
      }
    } catch (error) {
      console.error('Detection error:', error);
    }
    animationFrameRef.current = requestAnimationFrame(detectPoses);
  };

  // draw skeleton on canvas (simple)
  const drawSkeleton = (poses) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!poses || !poses.length) return;

    const pose = poses[0];
    const connections = [
      [0, 1], [0, 2], [1, 3], [2, 4], [5, 6],
      [5, 7], [7, 9], [6, 8], [8, 10],
      [5, 11], [6, 12], [11, 12],
      [11, 13], [13, 15], [12, 14], [14, 16]
    ];

    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,255,170,0.9)';
    connections.forEach(([s, e]) => {
      const start = pose.keypoints[s];
      const end = pose.keypoints[e];
      if (start && end && start.score > 0.25 && end.score > 0.25) {
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
    });

    pose.keypoints.forEach(k => {
      if (k.score > 0.25) {
        ctx.beginPath();
        ctx.arc(k.x, k.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,0,128,0.9)';
        ctx.fill();
      }
    });
  };

  // chat helpers (kept simple)
  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMessage = { type: 'user', message: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');

    setTimeout(() => {
      const botResponse = generateBotResponse(chatInput);
      setChatMessages(prev => [...prev, { type: 'bot', message: botResponse }]);
    }, 500);
  };

  const generateBotResponse = (input) => {
    const lower = input.toLowerCase();
    if (lower.includes('squat') || lower.includes('leg')) {
      return "For perfect squats: Keep your chest up, push knees out, and go below parallel. Imagine sitting back into a chair!";
    } else if (lower.includes('pushup') || lower.includes('push-up')) {
      return "Push-up tips: Keep body straight, lower until chest nearly touches ground, and elbows at 45° angle. Engage your core!";
    } else if (lower.includes('diet') || lower.includes('nutrition')) {
      return "For muscle building, aim for 1.6-2.2g protein per kg bodyweight. Stay hydrated and eat whole foods!";
    } else if (lower.includes('rest') || lower.includes('recovery')) {
      return "Rest is crucial! Aim for 7-9 hours of sleep and take 48 hours between training the same muscle groups.";
    } else if (lower.includes('cardio')) {
      return "Mix HIIT (20 mins) with steady-state cardio (30-45 mins) 3-4x per week for optimal results!";
    } else {
      return "Great question! Consistency beats perfection. Focus on proper form and progressive overload for best results!";
    }
  };

  // ---------- UI components below ----------
  if (currentView === 'login') {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <div className="app-root">
      <nav className="app-nav">
        <div className="nav-left">
          <Dumbbell className="nav-icon" />
          <h1 className="app-title">FormFit Pro</h1>
        </div>

        <div className="nav-center">
          <button className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentView('dashboard')}>Dashboard</button>
          <button className={`nav-btn ${currentView === 'workout' ? 'active' : ''}`} onClick={() => setCurrentView('workout')}>Workout</button>
          <button className={`nav-btn ${currentView === 'progress' ? 'active' : ''}`} onClick={() => setCurrentView('progress')}>Progress</button>
          <button className={`nav-btn ${currentView === 'chat' ? 'active' : ''}`} onClick={() => setCurrentView('chat')}>AI Coach</button>
        </div>

        <div className="nav-right">
          <div className="user-bubble">
            <User />
            <span className="user-name">{user?.name}</span>
          </div>
          <button className="icon-btn" onClick={handleLogout}><LogOut /></button>
          <button className="icon-btn small" onClick={() => setShowMenu(!showMenu)}><Menu /></button>
        </div>
      </nav>

      {showMenu && (
        <div className="mobile-menu">
          <button onClick={() => { setCurrentView('dashboard'); setShowMenu(false); }}>Dashboard</button>
          <button onClick={() => { setCurrentView('workout'); setShowMenu(false); }}>Workout</button>
          <button onClick={() => { setCurrentView('progress'); setShowMenu(false); }}>Progress</button>
          <button onClick={() => { setCurrentView('chat'); setShowMenu(false); }}>AI Coach</button>
        </div>
      )}

      <main className="app-main">
        {currentView === 'dashboard' && <DashboardView user={user} workoutHistory={workoutHistory} onStartWorkout={() => setCurrentView('workout')} />}
        {currentView === 'workout' && (
          <WorkoutView
            exercises={exercises}
            selectedExercise={selectedExercise}
            setSelectedExercise={setSelectedExercise}
            isCameraActive={isCameraActive}
            startCamera={startCamera}
            stopCamera={stopCamera}
            videoRef={videoRef}
            canvasRef={canvasRef}
            currentReps={currentReps}
            currentScore={currentScore}
            feedback={feedback}
            isInPosition={isInPosition}
            exerciseState={exerciseState}
          />
        )}
        {currentView === 'progress' && <ProgressView workoutHistory={workoutHistory} user={user} />}
        {currentView === 'chat' && (
          <ChatView
            messages={chatMessages}
            input={chatInput}
            setInput={setChatInput}
            onSubmit={handleChatSubmit}
          />
        )}
      </main>
    </div>
  );
};

/* ------------------- Sub-components (kept intentionally in same file) ------------------ */

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email && password) {
      onLogin(email, password);
    }
  };

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="brand">
          <Dumbbell className="brand-icon" />
          <h1>FormFit Pro</h1>
          <p>AI-Powered Fitness Coach</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <h2>{isSignup ? 'Create Account' : 'Welcome Back'}</h2>
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <button type="submit" className="primary-btn">{isSignup ? 'Sign Up' : 'Sign In'}</button>
          <div className="muted-link">
            <button type="button" onClick={() => setIsSignup(!isSignup)} className="link-btn">
              {isSignup ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
            </button>
          </div>
        </form>

        <div className="pro-features">
          <p>✨ Real-time pose detection</p>
          <p>📊 Track your progress</p>
          <p>🤖 AI coaching assistant</p>
        </div>
      </div>
    </div>
  );
};

const DashboardView = ({ user, workoutHistory, onStartWorkout }) => {
  const todayWorkouts = workoutHistory.filter(w => new Date(w.date).toDateString() === new Date().toDateString());
  const totalCalories = workoutHistory.reduce((sum, w) => sum + (w.calories || 0), 0);
  const avgScore = workoutHistory.length > 0 ? Math.round(workoutHistory.reduce((sum, w) => sum + (w.score || 0), 0) / workoutHistory.length) : 0;

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div>
          <h2>Welcome back, {user?.name}!</h2>
          <p>Ready to crush your fitness goals?</p>
        </div>
        <button className="primary-btn" onClick={onStartWorkout}>Start Workout</button>
      </div>

      <div className="stats-grid">
        <StatCard icon={<Award />} label="Total Workouts" value={user?.totalWorkouts || 0} />
        <StatCard icon={<Target />} label="Total Reps" value={user?.totalReps || 0} />
        <StatCard icon={<TrendingUp />} label="Avg Score" value={`${avgScore}%`} />
        <StatCard icon={<Calendar />} label="Calories Burned" value={totalCalories} />
      </div>

      <div className="panels">
        <div className="panel">
          <h3><Clock /> Today's Activity</h3>
          {todayWorkouts.length > 0 ? (
            todayWorkouts.slice(0, 5).map(workout => (
              <div key={workout.id} className="workout-row">
                <div>
                  <p className="bold">{workout.exercise}</p>
                  <p className="muted">{workout.reps} reps • {workout.duration}s</p>
                </div>
                <div className="right">
                  <p className="accent">{workout.score}%</p>
                  <p className="muted">{workout.calories} cal</p>
                </div>
              </div>
            ))
          ) : (
            <p className="muted">No workouts yet today. Let's get started!</p>
          )}
        </div>

        <div className="panel">
          <h3><TrendingUp /> Weekly Progress</h3>
          <div className="progress-list">
            <ProgressBar label="Workout Consistency" value={85} />
            <ProgressBar label="Form Quality" value={avgScore} />
            <ProgressBar label="Weekly Goal" value={60} />
          </div>
        </div>
      </div>

      <div className="tip-panel">
        <Info />
        <div>
          <h4>Pro Tip of the Day</h4>
          <p>Focus on progressive overload - gradually increase reps, weight, or difficulty each week. Consistency and proper form matter more than intensity!</p>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value }) => (
  <div className="stat-card">
    <div className="stat-icon">{icon}</div>
    <p className="stat-value">{value}</p>
    <p className="muted">{label}</p>
  </div>
);

const ProgressBar = ({ label, value }) => (
  <div className="progress-item">
    <div className="progress-row">
      <span className="muted">{label}</span>
      <span className="bold">{value}%</span>
    </div>
    <div className="bar-bg">
      <div className="bar-fill" style={{ width: `${value}%` }}></div>
    </div>
  </div>
);

const WorkoutView = ({
  exercises,
  selectedExercise,
  setSelectedExercise,
  isCameraActive,
  startCamera,
  stopCamera,
  videoRef,
  canvasRef,
  currentReps,
  currentScore,
  feedback,
  isInPosition,
  exerciseState
}) => (
  <div className="workout-root">
    <h2>Live Workout Session</h2>

    <div className="panel">
      <h3>Select Exercise</h3>
      <div className="exercise-grid">
        {Object.keys(exercises).map(key => (
          <button
            key={key}
            onClick={() => setSelectedExercise(key)}
            className={`exercise-btn ${selectedExercise === key ? 'selected' : ''}`}
          >
            <div className="emoji">{exercises[key].icon}</div>
            <div className="exercise-meta">
              <div className="bold">{exercises[key].name}</div>
              <div className="muted small">{exercises[key].muscle}</div>
            </div>
          </button>
        ))}
      </div>
    </div>

    <div className="layout-grid">
      <div className="video-col">
        <div className="video-card">
          <div className="video-inner">
            <video ref={videoRef} autoPlay playsInline muted className="video-el" />
            <canvas ref={canvasRef} className="canvas-el" />
            {isCameraActive && isInPosition && (
              <div className="inpos">🎯 IN POSITION</div>
            )}
            {!isCameraActive && (
              <div className="camera-off">
                <Camera />
                <p className="muted">Camera not active</p>
              </div>
            )}
          </div>
        </div>

        <div className="controls">
          {!isCameraActive ? (
            <button className="primary-btn" onClick={startCamera}>🎥 Start Camera</button>
          ) : (
            <>
              <button className="danger-btn" onClick={stopCamera}>⏹️ Stop & Save</button>
              <button className="secondary-btn" onClick={() => { /* reset selected quick */ }}>🔄 Reset</button>
            </>
          )}
        </div>
      </div>

      <div className="stats-col">
        <div className="stat-grid">
          <div className="stat-square reps">
            <p className="big">{currentReps}</p>
            <p className="muted">Reps</p>
          </div>
          <div className="stat-square score">
            <p className="big">{currentScore}</p>
            <p className="muted">Score</p>
          </div>
        </div>

        <div className="panel">
          <h4><Target /> Live Feedback</h4>
          <div className="feedback-list">
            {feedback.length > 0 ? (
              feedback.map((item, idx) => (
                <div key={idx} className={`feedback-item ${item.type}`}>
                  {item.message}
                </div>
              ))
            ) : (
              <p className="muted small">Start exercising to receive feedback...</p>
            )}
          </div>
        </div>

        <div className="panel">
          <h4>Exercise Info</h4>
          <div className="info-grid">
            <div className="row"><span className="muted">Muscle Group:</span><span className="bold">{exercises[selectedExercise].muscle}</span></div>
            <div className="row"><span className="muted">Difficulty:</span><span className="bold">{exercises[selectedExercise].difficulty}</span></div>
            <div className="row"><span className="muted">Calories/10 reps:</span><span className="bold">{exercises[selectedExercise].calories}</span></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const ProgressView = ({ workoutHistory, user }) => {
  const last7Days = [...Array(7)].map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  }).reverse();

  const dailyStats = last7Days.map(date => {
    const dayWorkouts = workoutHistory.filter(w => w.date.startsWith(date));
    return {
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
      reps: dayWorkouts.reduce((sum, w) => sum + w.reps, 0),
      calories: dayWorkouts.reduce((sum, w) => sum + (w.calories || 0), 0)
    };
  });

  const maxReps = Math.max(...dailyStats.map(d => d.reps), 1);
  const exerciseBreakdown = {};
  workoutHistory.forEach(w => {
    exerciseBreakdown[w.exercise] = (exerciseBreakdown[w.exercise] || 0) + w.reps;
  });

  return (
    <div className="progress-root">
      <h2>Your Progress</h2>

      <div className="grid-3">
        <div className="stat-card large">
          <Award />
          <p className="stat-value">{user?.totalWorkouts || 0}</p>
          <p className="muted">Total Sessions</p>
        </div>
        <div className="stat-card large">
          <Target />
          <p className="stat-value">{user?.totalReps || 0}</p>
          <p className="muted">Total Reps</p>
        </div>
        <div className="stat-card large">
          <TrendingUp />
          <p className="stat-value">{workoutHistory.reduce((sum, w) => sum + (w.calories || 0), 0)}</p>
          <p className="muted">Calories Burned</p>
        </div>
      </div>

      <div className="panel">
        <h3>7-Day Activity</h3>
        <div className="chart-compact">
          {dailyStats.map((day, idx) => (
            <div key={idx} className="chart-col">
              <div className="bar" style={{ height: `${(day.reps / maxReps) * 100}%` }} />
              <p className="muted small">{day.date}</p>
              <p className="muted small">{day.reps} reps</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <h3>Exercise Distribution</h3>
          <div className="stack">
            {Object.entries(exerciseBreakdown).slice(0, 5).map(([exercise, reps]) => (
              <div key={exercise}>
                <div className="row small">
                  <span className="muted">{exercise}</span>
                  <span className="bold">{reps} reps</span>
                </div>
                <div className="bar-bg small">
                  <div className="bar-fill" style={{ width: `${(reps / Math.max(user?.totalReps || 1, 1)) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h3>Recent Workouts</h3>
          <div className="stack">
            {workoutHistory.slice(0, 10).map(workout => (
              <div key={workout.id} className="workout-row">
                <div>
                  <p className="bold">{workout.exercise}</p>
                  <p className="muted small">{new Date(workout.date).toLocaleDateString()} • {workout.duration}s</p>
                </div>
                <div className="right">
                  <p className="accent">{workout.reps} reps</p>
                  <p className="muted small">{workout.score}%</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatView = ({ messages, input, setInput, onSubmit }) => {
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="chat-root">
      <div className="chat-card">
        <div className="chat-header">
          <h2>AI Fitness Coach</h2>
          <p className="muted">Ask me anything about exercises, nutrition, or form!</p>
        </div>

        <div className="chat-body">
          <div className="messages">
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-msg ${msg.type === 'user' ? 'user' : 'bot'}`}>
                <div className="bubble">{msg.message}</div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <form onSubmit={onSubmit} className="chat-input-row">
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about exercises, form, nutrition..." />
            <button className="primary-btn" type="submit">Send</button>
          </form>
        </div>

        <div className="chat-suggestions">
          {['Squat form tips', 'Nutrition advice', 'Rest days?', 'Cardio guide'].map((topic, idx) => (
            <button key={idx} onClick={() => setInput(topic)} className="suggest-btn">{topic}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;
