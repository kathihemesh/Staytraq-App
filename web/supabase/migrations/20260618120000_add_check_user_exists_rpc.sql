-- Create check_user_exists RPC to verify registration against auth.users
CREATE OR REPLACE FUNCTION public.check_user_exists(p_email text, p_phone text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean := false;
  v_clean_phone text;
BEGIN
  -- Check email in auth.users
  IF p_email IS NOT NULL AND p_email <> '' THEN
    SELECT EXISTS (
      SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)
    ) INTO v_exists;
    IF v_exists THEN
      RETURN true;
    END IF;
  END IF;

  -- Check phone in auth.users
  IF p_phone IS NOT NULL AND p_phone <> '' THEN
    -- Clean the phone input: remove non-digits
    v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
    
    IF length(v_clean_phone) = 10 THEN
      SELECT EXISTS (
        SELECT 1 FROM auth.users 
        WHERE regexp_replace(phone, '\D', '', 'g') = v_clean_phone
           OR phone IN (v_clean_phone, '91' || v_clean_phone, '+91' || v_clean_phone)
      ) INTO v_exists;
    ELSIF length(v_clean_phone) = 12 AND left(v_clean_phone, 2) = '91' THEN
      SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE regexp_replace(phone, '\D', '', 'g') = substring(v_clean_phone from 3)
           OR phone IN (v_clean_phone, substring(v_clean_phone from 3), '+' || v_clean_phone)
      ) INTO v_exists;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM auth.users
        WHERE regexp_replace(phone, '\D', '', 'g') = v_clean_phone
           OR phone IN (v_clean_phone, '+' || v_clean_phone)
      ) INTO v_exists;
    END IF;
  END IF;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_exists(text, text) TO anon, authenticated;
