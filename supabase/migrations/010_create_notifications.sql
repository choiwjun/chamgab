-- P4-R2: Notifications 테이블 생성
-- 사용자 알림

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL CHECK (type IN ('chamgab_changed', 'transaction_new', 'report_ready', 'system')),
  title VARCHAR(200) NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(user_id, type);

-- RLS 정책
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 본인 알림만 조회 가능
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

-- 본인 알림만 수정 가능 (읽음 처리)
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- 시스템에서만 알림 생성 가능 (service_role)
CREATE POLICY "Service can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- 본인 알림만 삭제 가능
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE USING (auth.uid() = user_id);

COMMENT ON TABLE notifications IS '사용자 알림';
COMMENT ON COLUMN notifications.user_id IS '수신자 UUID';
COMMENT ON COLUMN notifications.type IS '알림 유형 (chamgab_changed, transaction_new, report_ready, system)';
COMMENT ON COLUMN notifications.is_read IS '읽음 여부';
COMMENT ON COLUMN notifications.metadata IS '추가 데이터 (property_id, analysis_id 등)';
