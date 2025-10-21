const fs = require('fs');
const path = require('path');

// File path for persistence
const DATA_FILE = path.join(__dirname, '../data/events.json');

let events = {};
let counter = 1000;

// Load data from file on startup
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      events = data.events || {};
      counter = data.counter || 1000;
      console.log(`✅ Loaded ${Object.keys(events).length} events from disk`);
    }
  } catch (error) {
    console.error('❌ Error loading events from disk:', error);
  }
}

// Save data to file
function saveData() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const data = {
      events,
      counter,
      lastSaved: new Date().toISOString()
    };
    
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('❌ Error saving events to disk:', error);
  }
}

// Auto-save every 30 seconds
setInterval(saveData, 30000);

// Load data on module initialization
loadData();

function createEvent(creatorId, type, time = null) {
  const id = counter++;
  events[id] = {
    id,
    creatorId,
    type,
    time,
    invited: [],      // invited inside server users
    attendees: [],    // confirmed RSVP ✅
    guests: [],       // outside server guests
    reminderTimeoutId: null,  // for scheduled reminders
    channelId: null,  // channel to send reminder in
    messageId: null,  // original message ID
    createdAt: Date.now()  // timestamp for achievement tracking
  };
  saveData();
  return id;
}

function getEvent(id) {
  return events[id];
}

function getAllEvents() {
  return events;
}

function deleteEvent(id) {
  delete events[id];
  saveData();
}

// RSVP ✅
function addAttendee(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  if (!event.attendees.includes(user)) event.attendees.push(user);
  saveData();
  return true;
}

function removeAttendee(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  event.attendees = event.attendees.filter(u => u !== user);
  saveData();
  return true;
}

// Invited list
function addInvited(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  if (!event.invited.includes(user)) event.invited.push(user);
  saveData();
  return true;
}

function removeInvited(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  event.invited = event.invited.filter(u => u !== user);
  saveData();
  return true;
}

// Outside guests
function addGuest(id, userId, username, count) {
  const event = getEvent(id);
  if (!event) return false;
  event.guests.push({ userId, username, count });
  saveData();
  return true;
}

// Get total guest count for a specific user in an event
function getUserGuestCount(id, userId) {
  const event = getEvent(id);
  if (!event) return 0;
  return event.guests
    .filter(g => g.userId === userId)
    .reduce((total, g) => total + g.count, 0);
}

// List guests
function listGuests(id) {
  const event = getEvent(id);
  if (!event) return null;
  return { invited: event.invited, attendees: event.attendees, guests: event.guests };
}

// Reminder management
function setReminder(id, timeoutId, channelId, messageId) {
  const event = getEvent(id);
  if (!event) return false;
  event.reminderTimeoutId = timeoutId;
  event.channelId = channelId;
  event.messageId = messageId;
  saveData();
  return true;
}

function cancelReminder(id) {
  const event = getEvent(id);
  if (!event || !event.reminderTimeoutId) return false;
  clearTimeout(event.reminderTimeoutId);
  event.reminderTimeoutId = null;
  saveData();
  return true;
}

module.exports = {
  createEvent,
  getEvent,
  getAllEvents,
  deleteEvent,
  addAttendee,
  removeAttendee,
  addInvited,
  removeInvited,
  addGuest,
  getUserGuestCount,
  listGuests,
  setReminder,
  cancelReminder
};
