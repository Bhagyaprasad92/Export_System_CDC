-- ============================================================
-- CDC Export System - Database Initialization (Idempotent)
-- ============================================================

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create index on updated_at for CDC queries
CREATE INDEX IF NOT EXISTS idx_users_updated_at ON users (updated_at);

-- Create watermarks table
CREATE TABLE IF NOT EXISTS watermarks (
    id SERIAL PRIMARY KEY,
    consumer_id VARCHAR(255) NOT NULL UNIQUE,
    last_exported_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Seed 100,000 users (idempotent: only inserts if table is empty)
DO $$
DECLARE
    first_names TEXT[] := ARRAY[
        'James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda',
        'David','Elizabeth','William','Barbara','Richard','Susan','Joseph','Jessica',
        'Thomas','Sarah','Charles','Karen','Christopher','Lisa','Daniel','Nancy',
        'Matthew','Betty','Anthony','Margaret','Mark','Sandra','Donald','Ashley',
        'Steven','Kimberly','Paul','Emily','Andrew','Donna','Joshua','Michelle',
        'Kenneth','Carol','Kevin','Amanda','Brian','Dorothy','George','Melissa',
        'Timothy','Deborah','Ronald','Stephanie','Edward','Rebecca','Jason','Sharon',
        'Jeffrey','Laura','Ryan','Cynthia','Jacob','Kathleen','Gary','Amy',
        'Nicholas','Angela','Eric','Shirley','Jonathan','Anna','Stephen','Brenda',
        'Larry','Pamela','Justin','Emma','Scott','Nicole','Brandon','Helen',
        'Benjamin','Samantha','Samuel','Katherine','Raymond','Christine','Gregory','Debra',
        'Frank','Rachel','Alexander','Carolyn','Patrick','Janet','Jack','Catherine',
        'Dennis','Maria','Jerry','Heather','Tyler','Diane'
    ];
    last_names TEXT[] := ARRAY[
        'Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis',
        'Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas',
        'Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White',
        'Harris','Sanchez','Clark','Ramirez','Lewis','Robinson','Walker','Young',
        'Allen','King','Wright','Scott','Torres','Nguyen','Hill','Flores',
        'Green','Adams','Nelson','Baker','Hall','Rivera','Campbell','Mitchell',
        'Carter','Roberts','Gomez','Phillips','Evans','Turner','Diaz','Parker',
        'Cruz','Edwards','Collins','Reyes','Stewart','Morris','Morales','Murphy',
        'Cook','Rogers','Gutierrez','Ortiz','Morgan','Cooper','Peterson','Bailey',
        'Reed','Kelly','Howard','Ramos','Kim','Cox','Ward','Richardson',
        'Watson','Brooks','Chavez','Wood','James','Bennett','Gray','Mendoza',
        'Ruiz','Hughes','Price','Alvarez','Castillo','Sanders','Patel','Myers',
        'Long','Ross','Foster','Jimenez'
    ];
    domains TEXT[] := ARRAY['gmail.com','yahoo.com','outlook.com','hotmail.com','proton.me','mail.com','icloud.com','aol.com'];
    total_records INT := 100000;
    existing_count INT;
    batch_size INT := 5000;
    i INT;
    j INT;
    fname TEXT;
    lname TEXT;
    base_time TIMESTAMP WITH TIME ZONE;
    rec_created_at TIMESTAMP WITH TIME ZONE;
    rec_updated_at TIMESTAMP WITH TIME ZONE;
    rec_is_deleted BOOLEAN;
    rand_val DOUBLE PRECISION;
BEGIN
    -- Check if data already exists (idempotent)
    SELECT COUNT(*) INTO existing_count FROM users;
    IF existing_count >= total_records THEN
        RAISE NOTICE 'Users table already has % records. Skipping seed.', existing_count;
        RETURN;
    END IF;

    -- If some records exist but less than target, skip to avoid partial state issues
    IF existing_count > 0 THEN
        RAISE NOTICE 'Users table has % records (< %). Skipping to avoid duplicates.', existing_count, total_records;
        RETURN;
    END IF;

    base_time := NOW() - INTERVAL '30 days';

    -- Insert in batches for performance
    FOR i IN 0..(total_records / batch_size - 1) LOOP
        INSERT INTO users (name, email, created_at, updated_at, is_deleted)
        SELECT
            (first_names[1 + (random() * (array_length(first_names, 1) - 1))::int]) || ' ' ||
            (last_names[1 + (random() * (array_length(last_names, 1) - 1))::int]),
            -- Generate unique email: prefix_batchnum_seqnum@domain
            'user_' || (i * batch_size + s) || '_' || substr(md5(random()::text), 1, 6) || '@' ||
            (domains[1 + (random() * (array_length(domains, 1) - 1))::int]),
            -- created_at: spread over 30 days
            base_time + (random() * 30) * INTERVAL '1 day',
            -- updated_at: same as created_at or later
            base_time + (random() * 30) * INTERVAL '1 day' +
                (random() * 2) * INTERVAL '1 day',
            -- ~2% soft deleted
            (random() < 0.02)
        FROM generate_series(1, batch_size) AS s;
        
        RAISE NOTICE 'Inserted batch % of % (% records)', i + 1, total_records / batch_size, (i + 1) * batch_size;
    END LOOP;

    RAISE NOTICE 'Seeding complete. Total records: %', total_records;
END $$;
