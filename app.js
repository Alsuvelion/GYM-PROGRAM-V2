import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, onSnapshot, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// ── FIREBASE INIT ─────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDbVbEnL6PSJkV1Uzf4VaCxfVRvUpGnr7k",
  authDomain: "gym-program-c02c7.firebaseapp.com",
  projectId: "gym-program-c02c7",
  storageBucket: "gym-program-c02c7.firebasestorage.app",
  messagingSenderId: "694470409005",
  appId: "1:694470409005:web:76e7578c73b406b589b1a4"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── OFFLINE PERSISTENCE (Gemini point 3) ─────────────────────────────────────
// Caches data locally — if gym has no signal, saves to phone and syncs later
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline persistence unavailable: multiple tabs open.');
  } else if (err.code === 'unimplemented') {
    console.warn('Offline persistence not supported in this browser.');
  }
});

// ── UI ELEMENTS ───────────────────────────────────────────────────────────────
const authScreen    = document.getElementById('authScreen');
const onboardScreen = document.getElementById('onboardScreen');
const appContent    = document.getElementById('appContent');
const userBar       = document.getElementById('userBar');
const userAvatar    = document.getElementById('userAvatar');
const userNameEl    = document.getElementById('userName');
const syncStatus    = document.getElementById('syncStatus');

function showAuth()    { authScreen.style.display='flex'; onboardScreen.classList.remove('visible'); appContent.classList.remove('visible'); userBar.classList.remove('visible'); }
function showOnboard() { authScreen.style.display='none'; onboardScreen.classList.add('visible'); appContent.classList.remove('visible'); userBar.classList.remove('visible'); }
function showApp()     { authScreen.style.display='none'; onboardScreen.classList.remove('visible'); appContent.classList.add('visible'); userBar.classList.add('visible'); }

// ── SYNC STATUS ───────────────────────────────────────────────────────────────
function setSyncStatus(state) {
  if (state === 'syncing') {
    syncStatus.textContent = '↻ syncing...';
    syncStatus.className = 'syncing';
  } else if (state === 'error') {
    syncStatus.textContent = '⚠ offline — will sync later';
    syncStatus.className = 'error';
  } else {
    syncStatus.textContent = '● synced';
    syncStatus.className = 'synced';
  }
}

// ── GOOGLE SIGN IN ────────────────────────────────────────────────────────────
document.getElementById('googleSignInBtn').addEventListener('click', async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (e) {
    console.error('Sign in failed:', e);
  }
});

document.getElementById('signOutBtn').addEventListener('click', () => signOut(auth));

// ── ONBOARDING ────────────────────────────────────────────────────────────────
let selectedGoal = null;
document.querySelectorAll('.ob-goal-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ob-goal-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedGoal = btn.dataset.goal;
  });
});

document.getElementById('obSubmitBtn').addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) return;
  const name   = document.getElementById('obName').value.trim() || user.displayName.split(' ')[0];
  const weight = document.getElementById('obWeight').value.trim() || '—';
  const height = document.getElementById('obHeight').value.trim() || '—';
  const goal   = selectedGoal || 'both';
  const profile = { name, weight, height, goal, setupDone: true, createdAt: Date.now() };

  try {
    await setDoc(doc(db, 'users', user.uid, 'data', 'profile'), profile);
    applyProfile(profile);
    showApp();
    setupCloudTracker(user.uid);
  } catch (e) {
    console.error('Failed to save profile:', e);
    alert('Could not save your profile. Check your connection and try again.');
  }
});

// ── AUTH STATE ────────────────────────────────────────────────────────────────
const MY_MASTER_UID = "sLS7HoMXLJYqevbK3nFaOKQWSBz1"; 

let unsubTracker = null;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // 1. SOMEONE LOGGED IN: Hide login, show main app structure
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appContent').style.display = 'block'; 

    // 2. Setup their profile info (Avatar, Name, Weight, Height)
    const profileRef = doc(db, 'users', user.uid, 'profile', 'info');
    let profileSnap = await getDoc(profileRef);
    if (!profileSnap.exists()) {
      const defaultProfile = { name: user.displayName || 'Lifter', weight: 75, height: 175 };
      await setDoc(profileRef, defaultProfile);
      profileSnap = await getDoc(profileRef);
    }
    
    // Draw the top bar and stats
    document.getElementById('userBar').classList.add('visible');
    if (user.photoURL) document.getElementById('userAvatar').src = user.photoURL;
    document.getElementById('userName').textContent = profileSnap.data().name;
    applyProfile(profileSnap.data());

    // 3. THE BOUNCER LOGIC
    if (user.uid === MY_MASTER_UID) {
      // IT IS YOU! Ensure your hardcoded UI is visible
      console.log("Welcome back, Boss.");
      // If you added IDs to your gym program and meal plan sections, make sure they are visible:
      // document.getElementById('yourGymProgramDiv').style.display = 'block'; 
      
    } else {
      // IT IS A NEW USER! 
      console.log("New user detected.");
      
      // Look in the database to see if they already have an AI plan
      const userPlanRef = doc(db, 'users', user.uid, 'data', 'plan');
      const planSnap = await getDoc(userPlanRef);

      if (planSnap.exists()) {
        // They have a plan! Render it
        window.renderAIPlan(planSnap.data());
      } else {
        // THEY HAVE NO PLAN. Hide your hardcoded stuff so they get a blank slate.
        // NOTE: You need to add these IDs to the <section> tags in your index.html
        // e.g., <section id="myGymProgram">
        const myProgramSection = document.getElementById('myGymProgram');
        const myMealSection = document.getElementById('myMealPlan');
        
        if(myProgramSection) myProgramSection.style.display = 'none';
        if(myMealSection) myMealSection.style.display = 'none';
        
        // Force open the AI modal
        document.getElementById('aiOnboardModal').classList.add('visible');
      }
    }

    // 4. Start tracking their clicks (this stays the same)
    setupCloudTracker(user.uid);

  } else {
    // LOGGED OUT
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
    document.getElementById('userBar').classList.remove('visible');
    if (unsubTracker) { unsubTracker(); unsubTracker = null; }
  }
});

// ── APPLY PROFILE TO UI ───────────────────────────────────────────────────────
function applyProfile(profile) {
  const statWeight = document.querySelector('.stats-bar .stat:nth-child(1) span');
  const statHeight = document.querySelector('.stats-bar .stat:nth-child(2) span');
  const subtitle   = document.querySelector('.subtitle');
  if (statWeight) statWeight.textContent = profile.weight + ' kg';
  if (statHeight) statHeight.textContent = profile.height;
  if (subtitle)   subtitle.textContent   = profile.name + "'s Program + Meal Plan";
}

// ── CLOUD TRACKER SYNC (with error handling — Gemini point 3) ─────────────────
function setupCloudTracker(uid) {
  const trackerRef = doc(db, 'users', uid, 'data', 'tracker');

  // Real-time listener — auto-updates UI when data changes on any device
  unsubTracker = onSnapshot(trackerRef, (snap) => {
    if (snap.exists()) {
      // User has data saved in Firebase, load it up!
      window.trackerData = snap.data().days || {};
    } else {
      // THE FIX: New user with no data! Wipe the slate clean.
      window.trackerData = {}; 
    }
    
    // Redraw the calendar immediately with the correct data (whether full or empty)
    const sel = document.getElementById('monthSelect');
    if (sel) window.buildCalendar(2026, parseInt(sel.value));
    
    setSyncStatus('synced');
  }, (err) => {
    console.error('Tracker sync error:', err);
    setSyncStatus('error');
  });

  // Override saveData — writes to Firestore with error handling
  window.saveData = async (data) => {
    setSyncStatus('syncing');
    window.trackerData = data;
    try {
      await setDoc(trackerRef, { days: data }, { merge: true });
      setSyncStatus('synced');
    } catch (err) {
      console.error('Sync failed:', err);
      setSyncStatus('error');
      // Data is saved locally via IndexedDB persistence — will retry when online
    }
  };
}

// ── SECTION TOGGLE ────────────────────────────────────────────────────────────
document.querySelectorAll('.stab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.section;
    document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');
  });
});

// ── GYM DAY TABS ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(target).classList.add('active');
  });
});

// ── TRACKER ───────────────────────────────────────────────────────────────────
window.saveData = function(data) {
  try { localStorage.setItem('gymTracker_v1', JSON.stringify(data)); } catch {}
};

window.trackerData = (() => {
  try { return JSON.parse(localStorage.getItem('gymTracker_v1')) || {}; }
  catch { return {}; }
})();

const STATUS_CYCLE = [null, 'went', 'rest', 'skipped'];
const STATUS_ICON  = { went: '✓', rest: '●', skipped: '✗' };

let modalDateKey = null;

window.buildCalendar = function(year, month) {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = new Date();

  for (let i = 0; i < firstDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'cal-day';
    blank.style.visibility = 'hidden';
    grid.appendChild(blank);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const key    = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const entry  = window.trackerData[key] || {};
    const status = entry.status || null;
    const note   = entry.note   || '';

    const cell = document.createElement('div');
    cell.className = 'cal-day' + (status ? ' ' + status : '');

    const isToday = today.getFullYear() === year && today.getMonth()+1 === month && today.getDate() === d;
    if (isToday) cell.style.outline = '2px solid #4ecb8d';

    cell.innerHTML = `
      <div class="cal-date">${d}</div>
      <div class="cal-status">${status ? STATUS_ICON[status] : ''}</div>
      ${note ? '<div class="cal-note-btn" title="Has note">📝</div>' : '<div class="cal-note-btn">📝</div>'}
    `;

    cell.addEventListener('click', e => {
      if (e.target.classList.contains('cal-note-btn')) { openModal(key); return; }
      const cur  = STATUS_CYCLE.indexOf(entry.status || null);
      const next = STATUS_CYCLE[(cur + 1) % STATUS_CYCLE.length];
      window.trackerData[key] = { ...entry, status: next };
      window.saveData(window.trackerData);
      window.buildCalendar(year, month);
    });

    grid.appendChild(cell);
  }
};

function openModal(key) {
  modalDateKey = key;
  const entry = window.trackerData[key] || {};
  document.getElementById('noteInput').value = entry.note || '';
  document.getElementById('noteModal').classList.add('active');
}
function closeModal() {
  document.getElementById('noteModal').classList.remove('active');
  modalDateKey = null;
}

document.getElementById('noteSaveBtn')?.addEventListener('click', () => {
  if (!modalDateKey) return;
  const note = document.getElementById('noteInput').value.trim();
  window.trackerData[modalDateKey] = { ...(window.trackerData[modalDateKey] || {}), note };
  window.saveData(window.trackerData);
  const sel = document.getElementById('monthSelect');
  window.buildCalendar(2026, parseInt(sel.value));
  closeModal();
});

document.getElementById('noteDeleteBtn')?.addEventListener('click', () => {
  if (!modalDateKey) return;
  if (window.trackerData[modalDateKey]) delete window.trackerData[modalDateKey].note;
  window.saveData(window.trackerData);
  const sel = document.getElementById('monthSelect');
  window.buildCalendar(2026, parseInt(sel.value));
  closeModal();
});

document.getElementById('noteCancelBtn')?.addEventListener('click', closeModal);
document.getElementById('noteModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('noteModal')) closeModal();
});

// ── MONTH SELECTOR ────────────────────────────────────────────────────────────
const monthSelect = document.getElementById('monthSelect');
if (monthSelect) {
  const now          = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();
  monthSelect.value  = (currentYear === 2026 && currentMonth >= 5 && currentMonth <= 12) ? currentMonth : 5;
  window.buildCalendar(2026, parseInt(monthSelect.value));
  monthSelect.addEventListener('change', () => {
    window.buildCalendar(2026, parseInt(monthSelect.value));
  });
}

// ── AI PLAN RENDERING ────────────────────────────────────────────────────────
window.renderAIPlan = (planData) => {
  // 1. Find the sections and make them visible
  const myProgramSection = document.getElementById('myGymProgram');
  const myMealSection = document.getElementById('myMealPlan');
  myProgramSection.style.display = 'block';
  myMealSection.style.display = 'block';

  // 2. Set up the grid containers
  myProgramSection.innerHTML = '<h2 class="section-title">GYM ROUTINE</h2><div id="aiGymGrid" class="program-grid"></div>';
  myMealSection.innerHTML = '<h2 class="section-title">MEAL PLAN</h2><div id="aiMealGrid" class="program-grid"></div>';

  const gymGrid = document.getElementById('aiGymGrid');
  const mealGrid = document.getElementById('aiMealGrid');

  // 3. Draw the Gym Boxes
  if (planData.gymProgram) {
    for (const [day, exercises] of Object.entries(planData.gymProgram)) {
      let html = `<div class="stat-box"><div style="color: #888; font-size: 13px; margin-bottom: 8px;">${day.toUpperCase()}</div><div style="display: flex; flex-wrap: wrap; gap: 8px;">`;
      exercises.forEach(ex => { html += `<div class="pill pill-accent">${ex}</div>`; });
      html += `</div></div>`;
      gymGrid.innerHTML += html;
    }
  }

  // 4. Draw the Meal Boxes
  if (planData.mealPlan) {
    for (const [meal, foods] of Object.entries(planData.mealPlan)) {
      let html = `<div class="stat-box"><div style="color: #888; font-size: 13px; margin-bottom: 8px;">${meal.toUpperCase()}</div><div style="display: flex; flex-wrap: wrap; gap: 8px;">`;
      foods.forEach(food => { html += `<div class="pill" style="border-color: #d68b5b; color: #f0f0f0;">${food}</div>`; });
      html += `</div></div>`;
      mealGrid.innerHTML += html;
    }
  }
};

// ── AI PLAN GENERATOR ─────────────────────────────────────────────────────────
window.generatePlan = async () => {
  // 1. Put your NEW API Key here
  const API_KEY = "AIzaSyB7YNMmuhJBDIKjh9zXNgp7GHE7no0zrE0";

  // 2. Gather the inputs from the form
  const name = document.getElementById('aiName').value || 'User';
  const weight = document.getElementById('aiWeight').value;
  const goal = document.getElementById('aiGoal').value;
  const level = document.getElementById('aiLevel').value;
  const injuries = document.getElementById('aiInjuries').value;
  const days = Array.from(document.querySelectorAll('.day-selector input:checked')).map(cb => cb.value);
  const equipment = Array.from(document.querySelectorAll('.equip-selector input:checked')).map(cb => cb.value);

  // 3. Show a loading screen
  const step4 = document.getElementById('aiStep4');
  step4.innerHTML = `
    <div style="text-align: center; padding: 40px 0;">
      <h3 style="color: #4ecb8d; margin-bottom: 10px;">Consulting Gemini...</h3>
      <p style="color: #aaa; font-size: 14px;">Building your custom plan. This takes about 5 seconds.</p>
    </div>
  `;

  // 4. Create the instructions for Gemini
  const prompt = `You are an expert personal trainer. Create a workout and meal plan for this user:
  Name: ${name}
  Weight: ${weight}kg
  Goal: ${goal}
  Days available: ${days.join(", ")}
  Equipment: ${equipment.join(", ")}
  Level: ${level}
  Injuries: ${injuries}
  
  Return ONLY pure JSON. No markdown formatting, no backticks. Use exactly this structure:
  {
    "gymProgram": { "Day 1": ["Exercise 1", "Exercise 2"] },
    "mealPlan": { "breakfast": ["food 1"], "lunch": ["food 2"] }
  }`;

  // 5. Send it directly to Google via a Web Request
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });

    const data = await response.json();
    
    // 6. Clean up the AI's response to get pure JSON
    const textResponse = data.candidates[0].content.parts[0].text;
    const cleanJson = JSON.parse(textResponse.replace(/```json/g, "").replace(/```/g, ""));

    // 1. Save it to the user's database so it remembers it forever
    const user = auth.currentUser;
    if (user) {
      const userPlanRef = doc(db, 'users', user.uid, 'data', 'plan');
      await setDoc(userPlanRef, cleanJson);
    }

    // 2. Hide the modal
    document.getElementById('aiOnboardModal').classList.remove('visible');

    // 3. Paint it on the screen!
    window.renderAIPlan(cleanJson);
    
  } catch (error) {
    console.error("AI Error:", error);
    step4.innerHTML = `<h3 style="color: #ff6b6b; text-align: center;">Something went wrong. Check the console.</h3>`;
  }
};
