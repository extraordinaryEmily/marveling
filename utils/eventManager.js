let events = {};
let counter = 1000;

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
    messageId: null   // original message ID
  };
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
}

// RSVP ✅
function addAttendee(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  if (!event.attendees.includes(user)) event.attendees.push(user);
  return true;
}

function removeAttendee(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  event.attendees = event.attendees.filter(u => u !== user);
  return true;
}

// Invited list
function addInvited(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  if (!event.invited.includes(user)) event.invited.push(user);
  return true;
}

function removeInvited(id, user) {
  const event = getEvent(id);
  if (!event) return false;
  event.invited = event.invited.filter(u => u !== user);
  return true;
}

// Outside guests
function addGuest(id, guestName) {
  const event = getEvent(id);
  if (!event) return false;
  event.guests.push(guestName);
  return true;
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
  return true;
}

function cancelReminder(id) {
  const event = getEvent(id);
  if (!event || !event.reminderTimeoutId) return false;
  clearTimeout(event.reminderTimeoutId);
  event.reminderTimeoutId = null;
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
  listGuests,
  setReminder,
  cancelReminder
};
