-- 1. Invitations Table
CREATE TABLE IF NOT EXISTS public.invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    email TEXT, -- Optional, if we want to restrict to specific email
    token TEXT NOT NULL UNIQUE,
    role org_role DEFAULT 'contributor',
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    created_by UUID REFERENCES next_auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RLS for Invitations
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Only members of the org can create/see invites
CREATE POLICY "Org members can view invites" ON public.invitations
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = invitations.organization_id
            AND om.user_id = auth.uid()
        )
    );

CREATE POLICY "Org admins/members can create invites" ON public.invitations
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = invitations.organization_id
            AND om.user_id = auth.uid()
        )
    );

-- 3. Update Batches RLS to be Org-scoped
-- Currently batches might just check created_by. We need them to be visible if you are in the org.
-- Note: 'batches' table has 'organization_id' column from init.sql.

DROP POLICY IF EXISTS "Users can manage their own batches" ON public.batches;

CREATE POLICY "Org members can view batches" ON public.batches
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = batches.organization_id
            AND om.user_id = auth.uid()
        )
        OR 
        -- Fallback for personal batches (legacy)
        (created_by = auth.uid() AND organization_id IS NULL)
    );

CREATE POLICY "Org members can create batches" ON public.batches
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = batches.organization_id
            AND om.user_id = auth.uid()
        )
        OR
        (created_by = auth.uid() AND organization_id IS NULL)
    );

CREATE POLICY "Org members can update batches" ON public.batches
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.organization_id = batches.organization_id
            AND om.user_id = auth.uid()
        )
    );

-- 4. Auto-create Personal Org Function
-- When a user signs up, or if they don't have one, we can run this.
CREATE OR REPLACE FUNCTION create_personal_org()
RETURNS TRIGGER AS $$
BEGIN
    -- Only if they don't have one? For now, let's just create one.
    -- Actually, simpler to handle this in application logic or just leave it for now.
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
