-- ============================================================================
-- NANO SIGN DATABASE SCHEMA SETUP
-- Run this in your Supabase Dashboard -> SQL Editor -> click "Run"
-- ============================================================================

-- 1. Create Profiles Table (to track 15% discount usage)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    has_discount_used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Users can view own profile" ON public.profiles 
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles 
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role has full access" ON public.profiles
    USING (true) WITH CHECK (true);

-- 2. Create Saved Designs Table (for customizer sign settings)
CREATE TABLE IF NOT EXISTS public.saved_designs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT DEFAULT 'Untitled Design',
    design_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (RLS) for saved_designs
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;

-- Saved Designs Policies
CREATE POLICY "Users can insert own designs" ON public.saved_designs 
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view own designs" ON public.saved_designs 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own designs" ON public.saved_designs 
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own designs" ON public.saved_designs 
    FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role has full access on designs" ON public.saved_designs
    USING (true) WITH CHECK (true);

-- 3. Automatic Profile Creation Trigger
-- Ensures a public profile is created instantly when a user registers on auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, has_discount_used)
    VALUES (
        new.id, 
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Member'),
        FALSE
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
