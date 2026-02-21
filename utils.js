/**
 * utils.js
 * Date utility functions for RecallBot
 */

function daysLeft(dueDate) {
  const today = new Date();
  const due = new Date(dueDate);
  const diff = due - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// daysBetween is an alias for daysLeft (kept for backward compatibility)
const daysBetween = daysLeft;

module.exports = { daysLeft, daysBetween };
