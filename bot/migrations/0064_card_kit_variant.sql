-- Card Studio: members pick the male or female club kit (PF-020 4c). Existing rows keep the male kit they were made with.
ALTER TABLE card_requests ADD COLUMN kit_variant TEXT NOT NULL DEFAULT 'male' CHECK (kit_variant IN ('male', 'female'));
