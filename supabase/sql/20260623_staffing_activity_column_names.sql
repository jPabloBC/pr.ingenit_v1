DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pr_field_activity_logs'
      AND column_name = 'activity'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pr_field_activity_logs'
      AND column_name = 'activity_description'
  ) THEN
    ALTER TABLE pr_field_activity_logs
      RENAME COLUMN activity TO activity_description;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pr_field_activity_logs'
      AND column_name = 'activity'
  ) THEN
    ALTER TABLE pr_field_activity_logs
      ADD COLUMN activity text NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pr_field_activity_logs'
      AND column_name = 'activity_observations'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'pr_field_activity_logs'
      AND column_name = 'observations'
  ) THEN
    ALTER TABLE pr_field_activity_logs
      RENAME COLUMN activity_observations TO observations;
  END IF;
END $$;
