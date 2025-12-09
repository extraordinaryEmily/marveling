-- ========================================
-- Supabase Schema for Achievements System
-- ========================================
-- Run this SQL in your Supabase SQL Editor to create the tables

-- Table: user_stats
-- Stores user achievement statistics
CREATE TABLE IF NOT EXISTS user_stats (
  user_id TEXT PRIMARY KEY,
  hosts_created INTEGER DEFAULT 0,
  invites_sent INTEGER DEFAULT 0,
  rsvps_made INTEGER DEFAULT 0,
  maybe_count INTEGER DEFAULT 0,
  fast_rsvps INTEGER DEFAULT 0,
  worthy_events INTEGER DEFAULT 0,
  no_response_count INTEGER DEFAULT 0,
  recent_host_timestamps JSONB DEFAULT '[]'::jsonb,
  achievements JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: event_achievement_credits
-- Tracks which users have been credited for which events (prevents farming)
CREATE TABLE IF NOT EXISTS event_achievement_credits (
  id BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  credit_type TEXT NOT NULL CHECK (credit_type IN ('rsvp', 'maybe', 'fastRSVP')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id, credit_type)
);

-- Table: event_reschedule_count
-- Tracks reschedule counts for events (for Eye of Agamotto achievement)
CREATE TABLE IF NOT EXISTS event_reschedule_count (
  event_id TEXT PRIMARY KEY,
  reschedule_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_event_achievement_credits_event_id ON event_achievement_credits(event_id);
CREATE INDEX IF NOT EXISTS idx_event_achievement_credits_user_id ON event_achievement_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_stats(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers to auto-update updated_at
CREATE TRIGGER update_user_stats_updated_at
  BEFORE UPDATE ON user_stats
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_event_reschedule_count_updated_at
  BEFORE UPDATE ON event_reschedule_count
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

