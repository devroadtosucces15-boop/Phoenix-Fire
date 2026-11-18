-- PF-024 Item 16 – the player bio card: age and language (optional) and which optional fields the member shows on the card.
ALTER TABLE profiles ADD COLUMN age INTEGER;
ALTER TABLE profiles ADD COLUMN language TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN bio_show TEXT NOT NULL DEFAULT '{}'; -- JSON { ids, schedule, country, age, language }: true = show it on the card (age, country, language default to hidden)
