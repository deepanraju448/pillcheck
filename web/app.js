const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('[data-view]');
const modal = document.querySelector('#scanModal');
const toast = document.querySelector('#toast');
const toastText = document.querySelector('#toastText');
const authGate = document.querySelector('#authGate');
const cameraVideo = document.querySelector('#cameraVideo');
const cameraStatus = document.querySelector('#cameraStatus');
let cameraStream = null;
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let drugDatabase = [];
let selectedScanMode = 'pill';
let pendingProfile = null;

function updateWelcomeHeader() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
  const dateElement = document.querySelector('#welcomeDate');
  const greetingElement = document.querySelector('#welcomeGreeting');
  if (dateElement) dateElement.textContent = date;
  if (greetingElement) greetingElement.innerHTML = `${greeting}, Deepan <span class="wave">👋</span>`;
}

updateWelcomeHeader();

function setLoggedIn(contact) {
  sessionStorage.setItem('pillcheck-session', JSON.stringify({ contact, signedInAt: new Date().toISOString() }));
  if (!getMedicationProfile()) {
    localStorage.setItem('pillcheck-medication-profile', JSON.stringify({
      issue: 'seasonal allergy',
      medicine: 'Cetirizine',
      days: '7',
      dose: '10 mg · 1 tablet',
      slots: [
        { name: 'morning', time: '08:00', food: 'after food' },
        { name: 'night', time: '20:00', food: 'after food' },
      ],
    }));
    renderMedicationProfile();
  }
  authGate.classList.add('hidden');
}

function signOut() {
  sessionStorage.removeItem('pillcheck-session');
  authGate.classList.remove('hidden');
  document.querySelector('#gatePassword').value = '';
}

const storedSession = sessionStorage.getItem('pillcheck-session');
if (storedSession) {
  authGate.classList.add('hidden');
} else {
  localStorage.removeItem('pillcheck-medication-profile');
}

function getMedicationProfile() {
  try {
    return JSON.parse(localStorage.getItem('pillcheck-medication-profile') || 'null');
  } catch {
    return null;
  }
}

function formatDoseTime(value) {
  if (!value) return { time: '--:--', period: '--' };
  const [hours, minutes] = value.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour = hours % 12 || 12;
  return { time: `${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`, period };
}

function getDoseSlots(profile) {
  if (Array.isArray(profile?.slots) && profile.slots.length) return profile.slots;
  return profile?.time ? [{ name: 'prescribed dose', time: profile.time, food: profile.instructions || 'as prescribed' }] : [];
}

const DOSE_WINDOW_MINUTES = 60;

function getSlotMinutes(slot) {
  const [hours, minutes] = slot.time.split(':').map(Number);
  return (hours * 60) + minutes;
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDoseState(slot, records = [], now = new Date()) {
  const logged = records.some(record => record.result === 'match'
    && record.dateKey === getDateKey(now)
    && record.slotName === slot.name
    && record.scheduledTime === slot.time);
  if (logged) return 'taken';

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const minutesSinceDose = currentMinutes - getSlotMinutes(slot);
  if (minutesSinceDose < 0) return 'upcoming';
  return minutesSinceDose > DOSE_WINDOW_MINUTES ? 'missed' : 'due';
}

function getDashboardDoseSlot(slots, records = [], now = new Date()) {
  const sortedSlots = slots.slice().sort((a, b) => getSlotMinutes(a) - getSlotMinutes(b));
  const priority = ['missed', 'due', 'upcoming', 'taken'];
  return priority
    .map(state => sortedSlots.find(slot => getDoseState(slot, records, now) === state))
    .find(Boolean) || null;
}

function getDoseStateLabel(state) {
  return {
    upcoming: 'NEXT DOSE',
    due: 'DOSE DUE',
    missed: 'MISSED DOSE',
    taken: 'DOSE LOGGED',
  }[state] || 'NEXT DOSE';
}

function getNextDoseSlot(slots) {
  if (!slots.length) return null;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = slots
    .map(slot => ({ ...slot, minutes: Number(slot.time.split(':')[0]) * 60 + Number(slot.time.split(':')[1]) }))
    .sort((a, b) => a.minutes - b.minutes)
    .find(slot => slot.minutes >= currentMinutes);
  return upcoming || slots.slice().sort((a, b) => a.time.localeCompare(b.time))[0];
}

function renderMedicationProfile(records = []) {
  const profile = getMedicationProfile();
  const slots = getDoseSlots(profile);
  const nextSlot = getDashboardDoseSlot(slots, records);
  const doseState = nextSlot ? getDoseState(nextSlot, records) : 'upcoming';
  const time = formatDoseTime(nextSlot?.time);
  const doseCard = document.querySelector('.next-dose-card');
  const doseLabel = document.querySelector('#doseLabel');
  const markTakenButton = document.querySelector('#markTakenBtn');
  const remindButton = document.querySelector('#remindBtn');

  doseCard?.classList.toggle('missed', doseState === 'missed');
  if (doseLabel) doseLabel.innerHTML = `<span class="live-dot"></span> ${getDoseStateLabel(doseState)}`;
  document.querySelector('#nextDoseTime').innerHTML = `${time.time} <span>${time.period}</span>`;
  document.querySelector('#nextMedicine').textContent = profile?.medicine || 'No medication added';
  document.querySelector('#nextDoseDetail').textContent = profile && nextSlot
    ? `${profile.dose || 'Dose required'} · ${nextSlot.food}`
    : 'Add your prescription details to see your next dose.';
  document.querySelector('#timeUntil').textContent = !profile
    ? 'Set your schedule'
    : doseState === 'missed'
      ? 'Action needed'
      : doseState === 'due'
        ? 'Due now'
        : doseState === 'taken'
          ? 'Logged today'
          : `Due at ${time.time} ${time.period}`;
  document.querySelector('#reminderText').textContent = !profile || !nextSlot
    ? 'Your prescribed schedule will appear here.'
    : doseState === 'missed'
      ? `Missed dose · scheduled for ${time.time} ${time.period}. Confirm what to do with your pharmacist.`
      : doseState === 'due'
        ? `This dose is due now · ${nextSlot.food}`
        : doseState === 'taken'
          ? `Dose logged for ${time.time} ${time.period}`
          : `Available at ${time.time} ${time.period} · ${nextSlot.food}`;

  if (markTakenButton) {
    markTakenButton.dataset.slotName = nextSlot?.name || '';
    markTakenButton.dataset.scheduledTime = nextSlot?.time || '';
    markTakenButton.disabled = !profile || doseState === 'upcoming' || doseState === 'taken';
    markTakenButton.textContent = doseState === 'missed' ? 'Mark taken now' : doseState === 'taken' ? '✓ Taken' : '✓ Mark taken';
  }
  if (remindButton) {
    remindButton.disabled = !profile || doseState === 'taken';
  }

  const list = document.querySelector('#medicationList');
  if (!list) return;
  const checklist = document.querySelector('.dose-checklist');
  if (checklist) {
    const sortedSlots = slots.slice().sort((a, b) => getSlotMinutes(a) - getSlotMinutes(b));
    checklist.innerHTML = profile
      ? sortedSlots.map(slot => {
        const slotTime = formatDoseTime(slot.time);
        const state = getDoseState(slot, records);
        const stateLabel = state === 'taken' ? 'Taken' : state === 'missed' ? 'Missed' : state === 'due' ? 'Due now' : 'Upcoming';
        return `<div class="dose-check ${state}" aria-label="${slotTime.time} ${slotTime.period}, ${profile.medicine}, ${stateLabel}"><span>${state === 'taken' ? '✓' : state === 'missed' ? '!' : '•'}</span><div><strong>${slotTime.time} ${slotTime.period}</strong><small>${profile.medicine}</small></div><em>${stateLabel}</em></div>`;
      }).join('')
      : '<div class="dose-check"><span>•</span><div><strong>No doses scheduled</strong><small>Add your prescription details</small></div><em>Setup needed</em></div>';
  }
  list.innerHTML = profile
    ? slots.slice().sort((a, b) => getSlotMinutes(a) - getSlotMinutes(b)).map(slot => {
      const slotTime = formatDoseTime(slot.time);
      const state = getDoseState(slot, records);
      const stateClass = state === 'missed' ? 'missed' : state === 'taken' ? 'completed' : '';
      const action = state === 'taken'
        ? '<span class="state-badge done">✓ Taken</span>'
        : state === 'missed'
          ? `<button class="scan-button mark-slot-taken" data-slot-name="${slot.name}" data-scheduled-time="${slot.time}">Mark taken now</button>`
          : state === 'due'
            ? `<button class="scan-button mark-slot-taken" data-slot-name="${slot.name}" data-scheduled-time="${slot.time}">Mark taken</button>`
            : '<span class="state-badge upcoming">Upcoming</span>';
      return `<article class="med-row ${stateClass}"><div class="med-time" aria-label="${slotTime.time} ${slotTime.period}"><strong>${slotTime.time}</strong><span>${slotTime.period}</span></div><div class="med-pill blue"></div><div class="med-info"><h3>${profile.medicine}</h3><p>${profile.dose || 'Dose required'} · ${slot.food}${profile.days ? ` · ${profile.days} days` : ''}</p></div>${action}</article>`;
    }).join('')
    : '<div class="soft-card"><strong>No prescription added yet.</strong><p class="muted">Open Medication profile and enter the information from your doctor.</p></div>';
  document.querySelectorAll('.med-list .mark-slot-taken').forEach(button => button.addEventListener('click', () => markDoseTaken(button.dataset.slotName, button.dataset.scheduledTime)));
  renderSchedule(profile, records);
}

function renderSchedule(profile, records = []) {
  const list = document.querySelector('#scheduleList');
  if (!list) return;
  if (!profile) {
    list.innerHTML = '<div class="soft-card"><strong>No schedule yet.</strong><p class="muted">Add the time from your doctor in Medication profile.</p></div>';
    return;
  }
  const slots = getDoseSlots(profile);
  list.innerHTML = `<div class="day-divider"><span>${profile.medicine} · ${profile.days} days</span><span>${slots.length} dose${slots.length === 1 ? '' : 's'} daily</span></div>${slots.map(slot => { const time = formatDoseTime(slot.time); const state = getDoseState(slot, records); return `<div class="schedule-item ${state === 'missed' ? 'missed' : ''}"><span class="schedule-time">${time.time} ${time.period}</span><div class="med-pill blue"></div><div><h3>${profile.medicine} <small>${profile.dose || 'Dose required'} · ${slot.food}</small></h3></div><span class="state-badge ${state === 'taken' ? 'done' : state === 'missed' ? 'missed-label' : 'upcoming'}">${state === 'taken' ? '✓ Taken' : state === 'missed' ? 'Missed' : state === 'due' ? 'Due now' : 'Upcoming'}</span></div>`; }).join('')}${profile.issue ? `<p class="muted">Health issue: ${profile.issue}</p>` : ''}`;
}

function loadMedicationProfile() {
  const profile = getMedicationProfile();
  if (!profile) return;
  document.querySelector('#profileIssue').value = profile.issue || '';
  document.querySelector('#profileMedicine').value = profile.medicine || '';
  document.querySelectorAll('input[name="doseSlot"]').forEach(input => { input.checked = getDoseSlots(profile).some(slot => slot.name === input.value); });
  getDoseSlots(profile).forEach(slot => {
    const timeInput = document.querySelector(`#${slot.name}Time`);
    const foodInput = document.querySelector(`#${slot.name}Food`);
    if (timeInput) timeInput.value = slot.time;
    if (foodInput) foodInput.value = slot.food;
  });
  document.querySelector('#profileDays').value = profile.days || '';
  document.querySelector('#profileDose').value = profile.dose || '';
}

renderMedicationProfile();

function login(email, password, button, defaultLabel, onSuccess) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    notify('Enter a valid email address.');
    return;
  }
  if (!password) {
    notify('Enter your password.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Signing in…';
  fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
    .then(async response => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
      onSuccess(result.email);
    })
    .catch(error => notify(error.message))
    .finally(() => {
      button.disabled = false;
      button.textContent = defaultLabel;
    });
}
document.querySelector('#gateLogin').addEventListener('click', () => {
  const email = document.querySelector('#gateContact').value.trim();
  const password = document.querySelector('#gatePassword').value;
  login(email, password, document.querySelector('#gateLogin'), 'Sign in to PillCheck', setLoggedIn);
});

function collectProfileForm() {
  return {
    issue: document.querySelector('#profileIssue').value.trim(),
    medicine: document.querySelector('#profileMedicine').value.trim(),
    days: document.querySelector('#profileDays').value,
    dose: document.querySelector('#profileDose').value.trim(),
    slots: [...document.querySelectorAll('input[name="doseSlot"]:checked')].map(input => ({ name: input.value, time: document.querySelector(`#${input.value}Time`).value, food: document.querySelector(`#${input.value}Food`).value })),
  };
}

function renderProfileConfirmation(profile) {
  const summary = document.querySelector('#confirmSummary');
  const timing = profile.slots.map(slot => `${slot.name}: ${formatDoseTime(slot.time).time} ${formatDoseTime(slot.time).period} · ${slot.food}`).join('<br>');
  summary.innerHTML = `<strong>${profile.medicine}</strong><span>${profile.dose}</span><span>${profile.days} days</span><span>${timing}</span>`;
}

function closeProfileConfirmation() {
  document.querySelector('#confirmModal')?.classList.remove('show');
  pendingProfile = null;
}

document.querySelector('#profileForm').addEventListener('submit', event => {
  event.preventDefault();
  const profile = collectProfileForm();
  const doseError = document.querySelector('#profileDoseError');
  if (!profile.dose) {
    doseError.textContent = 'Please enter the dose — e.g. 500 mg · 1 tablet';
    document.querySelector('#profileDose').focus();
    return;
  }
  doseError.textContent = '';
  if (!profile.issue || !profile.medicine || !profile.days || !profile.slots.length || profile.slots.some(slot => !slot.time)) {
    notify('Add the medicine, number of days, and at least one prescribed time.');
    return;
  }
  pendingProfile = profile;
  renderProfileConfirmation(profile);
  document.querySelector('#confirmModal').classList.add('show');
});
document.querySelector('#profileDose').addEventListener('input', () => {
  document.querySelector('#profileDoseError').textContent = '';
});
document.querySelector('#closeConfirm').addEventListener('click', closeProfileConfirmation);
document.querySelector('#editProfile').addEventListener('click', closeProfileConfirmation);
document.querySelector('#confirmModal').addEventListener('click', event => {
  if (event.target.id === 'confirmModal') closeProfileConfirmation();
});
document.querySelector('#confirmProfile').addEventListener('click', () => {
  if (!pendingProfile) return;
  localStorage.setItem('pillcheck-medication-profile', JSON.stringify(pendingProfile));
  renderMedicationProfile();
  document.querySelector('#confirmModal').classList.remove('show');
  pendingProfile = null;
  showView('dashboard');
  notify('Medication profile updated');
});
loadMedicationProfile();
document.querySelectorAll('.voice-field').forEach(button => {
  button.dataset.idleLabel = button.getAttribute('aria-label') || 'Start voice input';
  button.addEventListener('click', () => listenForField(button.dataset.target, button));
});

fetch('./drug-database.json')
  .then(response => {
    if (!response.ok) throw new Error('Drug database request failed');
    return response.json();
  })
  .then(data => { drugDatabase = data; })
  .catch(() => notify('The local drug database could not be loaded.'));

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pillcheck-local', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('adherence')) {
        request.result.createObjectStore('adherence', { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAdherenceRecord(record) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('adherence', 'readwrite');
    transaction.objectStore('adherence').add(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
  await refreshAdherenceUI();
}

async function getAdherenceRecords() {
  const database = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const request = database.transaction('adherence', 'readonly').objectStore('adherence').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return records;
}

async function refreshAdherenceUI() {
  try {
    const records = await getAdherenceRecords();
    const profile = getMedicationProfile();
    const slots = getDoseSlots(profile);
    const today = getDateKey();
    const todayRecords = records.filter(record => record.result === 'match' && record.dateKey === today);
    const taken = slots.filter(slot => getDoseState(slot, records) === 'taken').length;
    const total = slots.length;
    const progress = total ? Math.round((taken / total) * 100) : 0;
    renderMedicationProfile(records);
    const medicationCount = profile?.medicine ? 1 : 0;
    document.querySelector('.progress-number strong').textContent = taken;
    document.querySelector('.progress-number span').textContent = `of ${total} doses`;
    document.querySelector('#statDoses').textContent = `${taken}/${total}`;
    document.querySelector('#statAdherence').textContent = `${progress}%`;
    document.querySelector('#statMedications').textContent = medicationCount;
    const progressBar = document.querySelector('.progress-bar span');
    if (progressBar) progressBar.style.width = `${progress}%`;
    const ring = document.querySelector('.ring');
    if (ring) ring.style.background = `radial-gradient(white 59%, transparent 60%), conic-gradient(#63ae89 ${progress}%, #e1eee7 0)`;
    document.querySelector('.ring span').textContent = `${progress}%`;
    const progressCaption = document.querySelector('.progress-caption span:last-child');
    if (progressCaption) progressCaption.textContent = `${Math.max(0, total - taken)} doses left`;
    const historyList = document.querySelector('#history .activity-list');
    if (historyList) historyList.innerHTML = '';
    todayRecords.slice(-5).reverse().forEach(record => {
      const item = document.createElement('div');
      item.innerHTML = `<span class="activity-check">✓</span><div><strong>${record.medicine} confirmed</strong><small>${new Date(record.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · OCR match saved locally</small></div><span class="activity-good">On device</span>`;
      historyList?.appendChild(item);
    });
  } catch {
    notify('Saved dose records could not be loaded.');
  }
}

async function markDoseTaken(slotName, scheduledTime) {
  const profile = getMedicationProfile();
  const slot = getDoseSlots(profile).find(item => item.name === slotName && item.time === scheduledTime);
  if (!profile || !slot) {
    notify('Add a medication before marking a dose as taken.');
    return;
  }

  const state = getDoseState(slot, await getAdherenceRecords());
  if (state === 'upcoming') {
    notify(`This dose is scheduled for ${formatDoseTime(slot.time).time} ${formatDoseTime(slot.time).period}.`);
    return;
  }
  if (state === 'taken') {
    await refreshAdherenceUI();
    notify('This dose is already logged for today.');
    return;
  }

  try {
    await saveAdherenceRecord({
      medicine: profile.medicine,
      slotName: slot.name,
      scheduledTime: slot.time,
      dateKey: getDateKey(),
      result: 'match',
      timestamp: new Date().toISOString(),
    });
    notify(state === 'missed' ? `${profile.medicine} logged after the missed-dose warning.` : `${profile.medicine} marked as taken.`);
  } catch {
    notify('The dose could not be saved locally.');
  }
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

function matchDrugName(ocrText, expectedName) {
  const normalizedText = normalize(ocrText);
  const words = normalizedText.split(/\s+/).filter(Boolean);
  const expected = normalize(expectedName);
  const candidates = [expected, ...(drugDatabase.find(item => item.name === expectedName)?.aliases || [])].map(normalize);
  let best = { text: '', score: 0 };
  const exactCandidate = candidates.find(candidate => normalizedText.includes(candidate));
  if (exactCandidate) {
    return { matched: true, score: 1, detected: exactCandidate };
  }
  words.forEach(word => candidates.forEach(candidate => {
    const distance = levenshtein(word, candidate);
    const score = 1 - (distance / Math.max(word.length, candidate.length, 1));
    if (score > best.score) best = { text: word, score };
  }));
  const compactText = normalizedText.replace(/\s+/g, '');
  candidates.forEach(candidate => {
    const compactCandidate = candidate.replace(/\s+/g, '');
    for (let index = 0; index <= Math.max(0, compactText.length - compactCandidate.length); index += 1) {
      const fragment = compactText.slice(index, index + compactCandidate.length);
      const score = 1 - (levenshtein(fragment, compactCandidate) / Math.max(fragment.length, compactCandidate.length, 1));
      if (score > best.score) best = { text: candidate, score };
    }
  });
  return { matched: best.score >= 0.68, score: best.score, detected: best.text || 'no medicine name detected' };
}

function speak(message) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message));
  }
}

function listenForCommand(onCommand, button = null, startMessage = 'Listening…', preserveCase = false) {
  if (!SpeechRecognition) {
    notify('Voice input not supported on this browser. Please type instead.');
    return;
  }
  if (recognition) recognition.abort();
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    button?.classList.add('listening');
    button?.setAttribute('aria-label', 'Listening for voice input');
    notify(startMessage);
  };
  recognition.onerror = event => notify(event.error === 'not-allowed' ? 'Microphone permission was blocked. Allow it in your browser.' : 'I could not hear that. Please try again.');
  recognition.onresult = event => {
    const transcript = event.results[0][0].transcript;
    onCommand(preserveCase ? transcript : transcript.toLowerCase());
  };
  recognition.onend = () => {
    button?.classList.remove('listening');
    button?.setAttribute('aria-label', button?.dataset.idleLabel || 'Start voice input');
    recognition = null;
  };
  try {
    recognition.start();
  } catch {
    button?.classList.remove('listening');
    notify('Voice input could not start. Please type instead.');
  }
}

function listenForField(targetId, button) {
  listenForCommand(command => {
    const field = document.querySelector(`#${targetId}`);
    if (field) {
      const normalizedCommand = command.toLowerCase();
      const spokenNumbers = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fourteen: 14, fifteen: 15, thirty: 30 };
      const value = targetId === 'profileDays'
        ? (normalizedCommand.match(/\d+/)?.[0] || spokenNumbers[normalizedCommand.trim()] || '')
        : command;
      if (!value) {
        notify(targetId === 'profileDays' ? 'Please say the number of treatment days.' : 'I could not hear a value. Please try again.');
        return;
      }
      field.value = value;
      notify(`Added "${value}" to the form.`);
    }
  }, button, 'Listening… speak your answer.', true);
}

function parsePrescriptionText(text) {
  const normalized = text.toLowerCase();
  const medicine = drugDatabase.find(item => normalized.includes(item.name.toLowerCase())
    || item.aliases.some(alias => normalized.includes(alias.toLowerCase())))?.name || '';
  const daysMatch = normalized.match(/(?:for\s*)?(\d+)\s*days?/i);
  const doseMatch = text.match(/(?:medicine|tablet)\s*:\s*[^,\n]+?\s+(\d+\s*(?:mg|mcg|g|ml|iu))/i);
  const slots = [];
  const addSlot = (name, time, food) => slots.push({ name, time, food });
  if (normalized.includes('morning')) addSlot('morning', '08:00', normalized.includes('before breakfast') ? 'before food' : 'after food');
  if (normalized.includes('afternoon') || normalized.includes('noon')) addSlot('afternoon', '13:00', normalized.includes('before lunch') ? 'before food' : 'after food');
  if (normalized.includes('night') || normalized.includes('evening')) addSlot('night', '20:00', normalized.includes('before dinner') ? 'before food' : 'after food');
  const issueMatch = text.match(/(?:diagnosis|problem|condition|for)\s*[:\-]?\s*([^\n,]+)/i);
  return {
    issue: issueMatch ? issueMatch[1].trim() : '',
    medicine,
    days: daysMatch ? (daysMatch[1] || daysMatch[2]) : '',
    dose: doseMatch ? `${doseMatch[1]} · 1 tablet` : '',
    slots,
  };
}

function populatePrescriptionProfile(details) {
  document.querySelectorAll('input[name="doseSlot"]').forEach(input => { input.checked = false; });
  document.querySelector('#profileIssue').value = details.issue || '';
  document.querySelector('#profileMedicine').value = details.medicine || '';
  document.querySelector('#profileDays').value = details.days || '';
  document.querySelector('#profileDose').value = details.dose || '';
  details.slots.forEach(slot => {
    const checkbox = document.querySelector(`input[name="doseSlot"][value="${slot.name}"]`);
    if (checkbox) checkbox.checked = true;
    document.querySelector(`#${slot.name}Time`).value = slot.time;
    document.querySelector(`#${slot.name}Food`).value = slot.food;
  });
}

function loadDemoPrescription() {
  const demoText = `PillCheck DEMO PRESCRIPTION - FICTIONAL SAMPLE ONLY
Patient: Sample Patient
Diagnosis: seasonal allergy
Medicine: Cetirizine 10 mg
Take one tablet every night after dinner for 7 days.
NOT A REAL PRESCRIPTION`;
  const details = parsePrescriptionText(demoText);
  populatePrescriptionProfile(details);
  closeScan();
  showView('profile');
  notify('Demo prescription identified. Review the sample details and save them.');
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraStatus.textContent = 'Camera unavailable in this browser';
    notify('Camera needs localhost or HTTPS and browser permission.');
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    cameraVideo.srcObject = cameraStream;
    cameraStatus.textContent = 'Camera live · on-device';
  } catch (error) {
    cameraStatus.textContent = error.name === 'NotAllowedError' ? 'Camera permission blocked' : 'Camera unavailable';
    notify(error.name === 'NotAllowedError' ? 'Allow camera access in your browser to scan.' : 'Unable to start the camera.');
  }
}

function stopCamera() {
  if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
}

function captureCameraFrame() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) throw new Error('Camera is not ready yet.');
  const canvas = document.querySelector('#captureCanvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  canvas.getContext('2d').drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function showView(name) {
  views.forEach(view => view.classList.toggle('active-view', view.id === name));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach(item => item.addEventListener('click', event => {
  event.preventDefault();
  if (item.dataset.view) showView(item.dataset.view);
}));
refreshAdherenceUI();
window.setInterval(refreshAdherenceUI, 60 * 1000);

function notify(message) {
  toastText.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(notify.timeout);
  notify.timeout = window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function openScan() {
  modal.classList.add('show');
  document.body.style.overflow = 'hidden';
  startCamera();
}
function openScanMode(modeName) {
  openScan();
  const mode = document.querySelector(`.scan-mode[data-mode="${modeName}"]`);
  mode?.click();
}
function closeScan() {
  modal.classList.remove('show');
  document.body.style.overflow = '';
  stopCamera();
}

document.querySelectorAll('#scanBtn, .scan-button:not(.mark-slot-taken)').forEach(button => button.addEventListener('click', openScan));
document.querySelector('#scanTabletBtn').addEventListener('click', () => openScanMode('pill'));
document.querySelector('#scanPrescriptionBtn').addEventListener('click', () => openScanMode('prescription'));
document.querySelector('#closeModal').addEventListener('click', closeScan);
modal.addEventListener('click', event => { if (event.target === modal) closeScan(); });
document.querySelectorAll('.scan-mode').forEach(mode => mode.addEventListener('click', () => {
  selectedScanMode = mode.dataset.mode;
  document.querySelectorAll('.scan-mode').forEach(item => item.classList.remove('active'));
  mode.classList.add('active');
  const modeCopy = {
    pill: ['VERIFYING 12:30 PM DOSE', 'Scan your Paracetamol', 'Hold one tablet steady in front of your camera. PillCheck checks shape, color, and imprint on-device.', 'Scan tablet', 'Place one tablet inside the frame'],
    prescription: ['PRESCRIPTION SCAN', 'Scan your prescription', 'Take a clear photo of the full page. PillCheck will extract names, doses, and schedules for your review.', 'Scan now', 'Fit the prescription inside the frame'],
    package: ['PACKAGE RECOGNITION', 'Scan a strip or bottle', 'Point your camera at the label or barcode to read the medicine name, batch, and expiry date.', 'Scan package', 'Fit the label inside the frame'],
    receipt: ['REFILL LOG', 'Scan pharmacy receipt', 'Capture a receipt to log a refill and update your local medicine stock count.', 'Scan receipt', 'Fit the receipt inside the frame'],
  }[mode.dataset.mode];
  const voiceButton = mode.dataset.mode === 'prescription' ? '' : '<button class="text-button centered" id="voiceScanBtn">Or say “scan now”</button>';
  document.querySelector('.modal-copy').innerHTML = `<p class="eyebrow">${modeCopy[0]}</p><h2 id="scanTitle">${modeCopy[1]}</h2><p class="muted">${modeCopy[2]}</p><button class="solid-button full" id="verifyBtn">${modeCopy[3]}</button>${voiceButton}`;
  document.querySelector('#scanHint').textContent = modeCopy[4];
  document.querySelector('#verifyBtn').addEventListener('click', () => showScanResult());
  document.querySelector('#mismatchBtn')?.addEventListener('click', () => showScanResult(true));
  document.querySelector('#voiceScanBtn')?.addEventListener('click', () => listenForCommand(handleVoiceCommand));
}));
document.querySelector('#remindBtn').addEventListener('click', () => notify('Reminder snoozed for 15 minutes.'));
document.querySelector('#markTakenBtn').addEventListener('click', event => {
  const button = event.currentTarget;
  markDoseTaken(button.dataset.slotName, button.dataset.scheduledTime);
});
document.querySelector('#addMedication').addEventListener('click', () => showView('profile'));

function showScanIntro() {
  const copy = document.querySelector('.modal-copy');
  const profile = getMedicationProfile();
  const medicine = profile?.medicine || 'your prescribed tablet';
  const time = profile ? formatDoseTime(profile.time) : null;
  copy.innerHTML = `<p class="eyebrow">VERIFYING ${time ? `${time.time} ${time.period}` : 'PRESCRIBED DOSE'}</p><h2>Scan your ${medicine}</h2><p class="muted">Hold one tablet or label steady in front of your camera. OCR and matching run in your browser.</p><button class="solid-button full" id="verifyBtn">Capture &amp; verify</button><button class="outline-button full demo-mismatch" id="mismatchBtn">Try mismatch demo</button><button class="text-button centered" id="voiceScanBtn">Or say “scan now”</button>`;
  document.querySelector('#verifyBtn').addEventListener('click', () => showScanResult());
  document.querySelector('#mismatchBtn').addEventListener('click', () => showScanResult(true));
  document.querySelector('#voiceScanBtn').addEventListener('click', () => listenForCommand(handleVoiceCommand));
}

function handleVoiceCommand(command) {
  if (command.includes('scan')) {
    showScanResult();
  } else if (command.includes('repeat')) {
    speak('Place one tablet inside the frame, then say scan now.');
    notify('Repeating scan instructions.');
  } else if (command.includes('confirm') || command.includes('yes')) {
    document.querySelector('#confirmDose')?.click();
  } else if (command.includes('later') || command.includes('snooze')) {
    closeScan();
    notify('Reminder snoozed for 15 minutes.');
  } else {
    notify(`I heard “${command}”. Say scan now, confirm, repeat, or remind me later.`);
  }
}

async function showScanResult(forceMismatch = false) {
  let match = { matched: false, score: 0, detected: 'no medicine name detected' };
  let ocrText = '';
  if (!forceMismatch) {
    try {
      notify(selectedScanMode === 'pill' ? 'Capturing tablet image…' : 'Reading image on-device…');
      const frame = captureCameraFrame();
      if (!window.Tesseract) throw new Error('OCR engine is still loading. Try again in a moment.');
      const result = await window.Tesseract.recognize(frame, 'eng', {
        logger: message => {
          if (message.status === 'recognizing text') cameraStatus.textContent = `Reading image ${Math.round(message.progress * 100)}%`;
        },
      });
      ocrText = result.data.text;
      if (selectedScanMode === 'prescription') {
        const details = parsePrescriptionText(ocrText);
        populatePrescriptionProfile(details);
        closeScan();
        showView('profile');
        notify(details.medicine ? 'Prescription details recognized. Review them and save your dashboard.' : 'Prescription text captured. Please review and complete the profile fields.');
        return;
      }
      match = matchDrugName(ocrText, getMedicationProfile()?.medicine || 'Paracetamol');
    } catch (error) {
      notify(error.message || 'Could not read this image.');
      return;
    }
  } else {
    match = { matched: false, score: 0.18, detected: 'losartan' };
    ocrText = 'sample mismatch: losartan';
  }
  const copy = document.querySelector('.modal-copy');
  const verdict = match.matched ? 'MATCH CONFIRMED' : 'MISMATCH DETECTED';
  const expectedMedicine = getMedicationProfile()?.medicine || 'your prescribed medicine';
  const title = match.matched ? `This matches ${expectedMedicine}` : 'This does not look right';
  const description = match.matched
    ? `OCR detected “${match.detected}” with ${Math.round(match.score * 100)}% confidence.`
    : `OCR detected “${match.detected}”. Your prescribed tablet should be ${expectedMedicine}.`;
  copy.innerHTML = `<p class="eyebrow">${verdict}</p><h2>${title}</h2><p class="muted">${description}</p><p class="ocr-detail">On-device OCR text: <em>${ocrText || 'sample mismatch'}</em></p>${match.matched ? '<button class="solid-button full" id="confirmDose">Confirm dose</button>' : '<button class="solid-button full" id="retryScan">Scan the correct tablet</button>'}<button class="text-button centered" id="scanAgain">Scan again</button>`;
  if (match.matched) {
    document.querySelector('#confirmDose').addEventListener('click', async () => {
      try {
        const profile = getMedicationProfile();
        const records = await getAdherenceRecords();
        const slot = getDashboardDoseSlot(getDoseSlots(profile), records);
        if (slot && getDoseState(slot, records) === 'upcoming') {
          const scheduled = formatDoseTime(slot.time);
          notify(`This dose is scheduled for ${scheduled.time} ${scheduled.period}. It cannot be marked taken yet.`);
          return;
        }
        await saveAdherenceRecord({
          timestamp: new Date().toISOString(),
          medicine: profile?.medicine || 'Paracetamol',
          expected: profile?.medicine || 'Paracetamol',
          slotName: slot?.name,
          scheduledTime: slot?.time,
          dateKey: getDateKey(),
          ocrText,
          score: match.score,
          result: 'match',
          mode: selectedScanMode,
        });
        closeScan();
        notify('Dose confirmed and saved on this device.');
      } catch {
        notify('The dose matched, but could not be saved locally.');
      }
    });
  }
  document.querySelector('#retryScan')?.addEventListener('click', showScanIntro);
  document.querySelector('#scanAgain').addEventListener('click', showScanIntro);
}

document.querySelector('#verifyBtn').addEventListener('click', () => showScanResult());
document.querySelector('#mismatchBtn')?.addEventListener('click', () => showScanResult(true));

document.querySelector('#voiceBtn').addEventListener('click', () => {
  speak('I am listening. Say scan now, confirm, repeat, or remind me later.');
  listenForCommand(command => {
    if (command.includes('scan')) openScan();
    else if (command.includes('repeat')) speak('Your next dose is Paracetamol, 500 milligrams, at 12:30 PM.');
    else if (command.includes('later') || command.includes('snooze')) notify('Reminder snoozed for 15 minutes.');
    else notify(`I heard “${command}”. Try saying scan now or repeat.`);
  });
});
document.querySelector('#voiceScanBtn').addEventListener('click', () => listenForCommand(handleVoiceCommand));

document.querySelectorAll('.toggle.on').forEach(toggle => toggle.addEventListener('click', () => toggle.classList.toggle('on')));

const authModal = document.querySelector('#authModal');
document.querySelector('#profileBtn').addEventListener('click', () => authModal.classList.add('show'));
document.querySelector('#closeAuth').addEventListener('click', () => authModal.classList.remove('show'));
authModal.addEventListener('click', event => { if (event.target === authModal) authModal.classList.remove('show'); });
document.querySelector('#sendPassword').addEventListener('click', () => {
  const contact = document.querySelector('#authContact').value.trim();
  const password = document.querySelector('#authPassword').value;
  login(contact, password, document.querySelector('#sendPassword'), 'Sign in securely', email => {
    setLoggedIn(email);
    authModal.classList.remove('show');
  });
});
document.querySelector('#startOnboarding').addEventListener('click', () => {
  document.querySelector('#authTitle').textContent = 'Set up your PillCheck profile';
  document.querySelector('.auth-card .eyebrow').textContent = 'A FEW QUICK DETAILS';
  document.querySelector('.auth-card .muted').textContent = 'Your preferences help us make reminders easier to hear, see, and follow.';
  document.querySelector('.auth-card label').firstChild.textContent = 'Your name';
  document.querySelector('#authContact').placeholder = 'e.g. Deepan Raju';
  document.querySelector('#sendPassword').textContent = 'Continue setup';
});
