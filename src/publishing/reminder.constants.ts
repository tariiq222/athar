// Single source for the reminders queue/job identifiers, shared by the
// reminder producer (ReminderService.create) and the worker (ReminderProcessor).
export const REMINDER_QUEUE = 'reminders';
export const REMINDER_JOB = 'deliver-reminder';
