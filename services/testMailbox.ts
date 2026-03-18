export interface TestMailboxEntry {
  id: string;
  to: string;
  subject: string;
  text: string;
  previewUrl?: string;
  createdAt: string;
}

const mailbox: TestMailboxEntry[] = [];
const MAX_ENTRIES = 100;

export function recordTestMailboxEntry(entry: Omit<TestMailboxEntry, 'id' | 'createdAt'>) {
  mailbox.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    ...entry,
  });

  if (mailbox.length > MAX_ENTRIES) {
    mailbox.length = MAX_ENTRIES;
  }
}

export function listTestMailboxEntries(filters?: {
  email?: string;
  subject?: string;
}) {
  const normalizedEmail = filters?.email?.trim().toLowerCase();
  const normalizedSubject = filters?.subject?.trim().toLowerCase();

  return mailbox.filter((entry) => {
    if (normalizedEmail && entry.to.trim().toLowerCase() !== normalizedEmail) {
      return false;
    }

    if (normalizedSubject && !entry.subject.trim().toLowerCase().includes(normalizedSubject)) {
      return false;
    }

    return true;
  });
}

export function clearTestMailbox() {
  mailbox.length = 0;
}
