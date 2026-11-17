-- PF-023: a member marks available with the positions they want for Rush (not their profile position). The LFG "later" answer is gone.
ALTER TABLE rush_lfg ADD COLUMN positions TEXT NOT NULL DEFAULT '[]';  -- JSON: 1 or 2 of GK ST CB W, or ["ANY"]
