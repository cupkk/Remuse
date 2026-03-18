import { v4 as uuidv4 } from 'uuid';
import db from './database.ts';

export type FeedbackType = 'bug' | 'feature' | 'support' | 'other';
export type FeedbackStatus = 'open' | 'in_review' | 'closed';

interface FeedbackRow {
  id: string;
  user_id: string;
  email_snapshot: string;
  nickname_snapshot: string;
  type: FeedbackType;
  message: string;
  status: FeedbackStatus;
  created_at: string;
  updated_at: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS feedback_submissions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    email_snapshot TEXT NOT NULL DEFAULT '',
    nickname_snapshot TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'other',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_submissions_status_created
  ON feedback_submissions(status, created_at DESC);
`);

const stmts = {
  insertFeedback: db.prepare<{
    id: string;
    user_id: string;
    email_snapshot: string;
    nickname_snapshot: string;
    type: FeedbackType;
    message: string;
  }>(`
    INSERT INTO feedback_submissions (
      id,
      user_id,
      email_snapshot,
      nickname_snapshot,
      type,
      message
    ) VALUES (
      @id,
      @user_id,
      @email_snapshot,
      @nickname_snapshot,
      @type,
      @message
    )
  `),
  listFeedback: db.prepare(`
    SELECT * FROM feedback_submissions
    ORDER BY
      CASE status
        WHEN 'open' THEN 0
        WHEN 'in_review' THEN 1
        ELSE 2
      END ASC,
      created_at DESC
  `),
  updateFeedbackStatus: db.prepare<{
    id: string;
    status: FeedbackStatus;
  }>(`
    UPDATE feedback_submissions
    SET status = @status,
        updated_at = datetime('now')
    WHERE id = @id
  `),
};

export function createFeedbackSubmission(input: {
  userId: string;
  email: string | null | undefined;
  nickname: string | undefined;
  type: FeedbackType;
  message: string;
}) {
  const id = uuidv4();
  stmts.insertFeedback.run({
    id,
    user_id: input.userId,
    email_snapshot: input.email || '',
    nickname_snapshot: input.nickname || '',
    type: input.type,
    message: input.message.trim(),
  });

  return id;
}

export function listFeedbackSubmissions() {
  return (stmts.listFeedback.all() as FeedbackRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email_snapshot,
    nickname: row.nickname_snapshot,
    type: row.type,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export function updateFeedbackSubmissionStatus(id: string, status: FeedbackStatus) {
  stmts.updateFeedbackStatus.run({ id, status });
}
