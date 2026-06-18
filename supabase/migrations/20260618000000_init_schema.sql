-- 1. Create tables

-- Skills table
CREATE TABLE IF NOT EXISTS public.skills (
  id text PRIMARY KEY DEFAULT 's_' || extract(epoch from now())::text,
  title_da text NOT NULL,
  title_en text NOT NULL,
  category text NOT NULL,
  vibe_coder text NOT NULL,
  vibe_coder_title_da text NOT NULL,
  vibe_coder_title_en text NOT NULL,
  rating numeric DEFAULT 5.0,
  reviews_count integer DEFAULT 0,
  description_da text NOT NULL,
  description_en text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  github_url text
);

-- Showcase table
CREATE TABLE IF NOT EXISTS public.showcase (
  id text PRIMARY KEY DEFAULT 'p_' || extract(epoch from now())::text,
  title_da text NOT NULL,
  title_en text NOT NULL,
  author text NOT NULL,
  description_da text NOT NULL,
  description_en text NOT NULL,
  tools text[] NOT NULL DEFAULT '{}',
  prompts text[] NOT NULL DEFAULT '{}',
  upvotes integer NOT NULL DEFAULT 1,
  demo_url text,
  github_url text,
  image_url text NOT NULL DEFAULT '/images/autonewsletter.jpg',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Showcase Upvotes join table
CREATE TABLE IF NOT EXISTS public.showcase_upvotes (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id text REFERENCES public.showcase(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, project_id)
);

-- Forum Threads table
CREATE TABLE IF NOT EXISTS public.forum_threads (
  id text PRIMARY KEY DEFAULT 't_' || extract(epoch from now())::text,
  title_da text NOT NULL,
  title_en text NOT NULL,
  author text NOT NULL,
  category text NOT NULL,
  content_da text NOT NULL,
  content_en text NOT NULL,
  upvotes integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Forum Replies table
CREATE TABLE IF NOT EXISTS public.forum_replies (
  id text PRIMARY KEY DEFAULT 'r_' || extract(epoch from now())::text,
  thread_id text REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  author text NOT NULL,
  content_da text NOT NULL,
  content_en text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Thread Upvotes join table
CREATE TABLE IF NOT EXISTS public.thread_upvotes (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id text REFERENCES public.forum_threads(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, thread_id)
);

-- Blog Posts table
CREATE TABLE IF NOT EXISTS public.blog_posts (
  id text PRIMARY KEY,
  title_da text NOT NULL,
  title_en text NOT NULL,
  excerpt_da text NOT NULL,
  excerpt_en text NOT NULL,
  content_da text NOT NULL,
  content_en text NOT NULL,
  author text NOT NULL,
  read_time text NOT NULL,
  published_at text NOT NULL,
  image_url text NOT NULL,
  category text NOT NULL
);

-- Agents table
CREATE TABLE IF NOT EXISTS public.agents (
  id text PRIMARY KEY DEFAULT 'a_' || extract(epoch from now())::text,
  name text NOT NULL,
  developer text NOT NULL,
  category text NOT NULL,
  description_da text NOT NULL,
  description_en text NOT NULL,
  install_command text NOT NULL,
  system_prompt_da text NOT NULL,
  system_prompt_en text NOT NULL,
  upvotes integer NOT NULL DEFAULT 1,
  tags text[] NOT NULL DEFAULT '{}',
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Agent Upvotes join table
CREATE TABLE IF NOT EXISTS public.agent_upvotes (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text REFERENCES public.agents(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, agent_id)
);


-- 2. Upvote Counter Triggers & Security Definer Functions

-- Showcase Upvote Triggers
CREATE OR REPLACE FUNCTION public.increment_project_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.showcase
  SET upvotes = upvotes + 1
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_project_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.showcase
  SET upvotes = upvotes - 1
  WHERE id = OLD.project_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_showcase_upvote_insert
AFTER INSERT ON public.showcase_upvotes
FOR EACH ROW EXECUTE FUNCTION public.increment_project_upvotes();

CREATE TRIGGER tr_showcase_upvote_delete
AFTER DELETE ON public.showcase_upvotes
FOR EACH ROW EXECUTE FUNCTION public.decrement_project_upvotes();

-- Forum Thread Upvote Triggers
CREATE OR REPLACE FUNCTION public.increment_thread_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.forum_threads
  SET upvotes = upvotes + 1
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_thread_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.forum_threads
  SET upvotes = upvotes - 1
  WHERE id = OLD.thread_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_thread_upvote_insert
AFTER INSERT ON public.thread_upvotes
FOR EACH ROW EXECUTE FUNCTION public.increment_thread_upvotes();

CREATE TRIGGER tr_thread_upvote_delete
AFTER DELETE ON public.thread_upvotes
FOR EACH ROW EXECUTE FUNCTION public.decrement_thread_upvotes();

-- Agent Upvote Triggers
CREATE OR REPLACE FUNCTION public.increment_agent_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agents
  SET upvotes = upvotes + 1
  WHERE id = NEW.agent_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.decrement_agent_upvotes()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.agents
  SET upvotes = upvotes - 1
  WHERE id = OLD.agent_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_agent_upvote_insert
AFTER INSERT ON public.agent_upvotes
FOR EACH ROW EXECUTE FUNCTION public.increment_agent_upvotes();

CREATE TRIGGER tr_agent_upvote_delete
AFTER DELETE ON public.agent_upvotes
FOR EACH ROW EXECUTE FUNCTION public.decrement_agent_upvotes();

-- Revoke execute from public on all security definer functions to prevent direct execution
REVOKE EXECUTE ON FUNCTION public.increment_project_upvotes() FROM public;
REVOKE EXECUTE ON FUNCTION public.decrement_project_upvotes() FROM public;
REVOKE EXECUTE ON FUNCTION public.increment_thread_upvotes() FROM public;
REVOKE EXECUTE ON FUNCTION public.decrement_thread_upvotes() FROM public;
REVOKE EXECUTE ON FUNCTION public.increment_agent_upvotes() FROM public;
REVOKE EXECUTE ON FUNCTION public.decrement_agent_upvotes() FROM public;


-- 3. Row-Level Security (RLS) Configuration

-- Enable RLS on all tables
ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.showcase_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forum_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.thread_upvotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_upvotes ENABLE ROW LEVEL SECURITY;

-- skills policies
CREATE POLICY "Allow public read access to skills" ON public.skills FOR SELECT TO anon, authenticated USING (true);

-- showcase policies
CREATE POLICY "Allow public read access to showcase" ON public.showcase FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to showcase" ON public.showcase FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner update to showcase" ON public.showcase FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to showcase" ON public.showcase FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- showcase_upvotes policies
CREATE POLICY "Allow public read access to showcase_upvotes" ON public.showcase_upvotes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to showcase_upvotes" ON public.showcase_upvotes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to showcase_upvotes" ON public.showcase_upvotes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- forum_threads policies
CREATE POLICY "Allow public read access to forum_threads" ON public.forum_threads FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to forum_threads" ON public.forum_threads FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner update to forum_threads" ON public.forum_threads FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to forum_threads" ON public.forum_threads FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- forum_replies policies
CREATE POLICY "Allow public read access to forum_replies" ON public.forum_replies FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to forum_replies" ON public.forum_replies FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner update to forum_replies" ON public.forum_replies FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to forum_replies" ON public.forum_replies FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- thread_upvotes policies
CREATE POLICY "Allow public read access to thread_upvotes" ON public.thread_upvotes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to thread_upvotes" ON public.thread_upvotes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to thread_upvotes" ON public.thread_upvotes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- blog_posts policies
CREATE POLICY "Allow public read access to blog_posts" ON public.blog_posts FOR SELECT TO anon, authenticated USING (true);

-- agents policies
CREATE POLICY "Allow public read access to agents" ON public.agents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to agents" ON public.agents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner update to agents" ON public.agents FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to agents" ON public.agents FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- agent_upvotes policies
CREATE POLICY "Allow public read access to agent_upvotes" ON public.agent_upvotes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow authenticated insert to agent_upvotes" ON public.agent_upvotes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Allow owner delete to agent_upvotes" ON public.agent_upvotes FOR DELETE TO authenticated USING (auth.uid() = user_id);
