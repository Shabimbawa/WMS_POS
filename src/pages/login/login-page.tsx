import { Input, Flex, Typography, Button, Checkbox } from 'antd';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { containerStyle, rightHalfStyle, cardStyle } from './login-page.style';
import { supabase } from '../../utils/supabase-client';
import { ErrorNotificationPopup } from '../../common/items/notification/errror-notif';
import { fetchProfile, profileQueryKey } from './auth-useQuery';
import { getLandingPath } from '../../common/components/sidebar/nav-items';

export interface LoginCredentials {
  email: string;
  password:  string;
}

export default function LoginPage() {
  const {Title} = Typography;
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [credentials, setCredentials] = useState<LoginCredentials>({
    email: '',
    password: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Drop the previous session's rows now rather than during sign-out. Sign-out
  // runs while an authenticated page is still mounted, so clearing there makes
  // its queries refetch against the destroyed session and cache the empty
  // result. Nothing is subscribed on this page, so clearing here is inert.
  useEffect(() => {
    queryClient.clear();
  }, [queryClient]);

  const { showError, contextHolder } = ErrorNotificationPopup();
    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setCredentials((prev) => ({
        ...prev,
        [name]: value,
        }));
    };


  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });

      if (error) {
        showError(error, 'Login Failed');
        return;
      }

      // Where a user lands depends on their role — /users is admin-only, so
      // sending everyone there dropped approvers and employees on a page they
      // can't read. Resolve the profile first, then land on the first page
      // their role actually has.
      let landingPath = '/container';
      const userId = data.user?.id;

      if (userId) {
        try {
          const profile = await fetchProfile(userId);
          // Prime the cache useCurrentProfile reads, so the sidebar and route
          // guard on the next page resolve without a second round-trip.
          queryClient.setQueryData(profileQueryKey(userId), profile);
          landingPath = getLandingPath(profile.roles);
        } catch {
          // A failed profile lookup shouldn't block a valid login. /leaves is
          // readable by every role, so it's the safe fallback.
        }
      }

      navigate(landingPath, { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };



    return(
        <Flex style={containerStyle} component="form" onSubmit={handleLogin}>
            {contextHolder}
            {/* <Flex style={imageHalfStyle}>
                <Title level={1} style={{textAlign: 'center', marginTop: 24, color: '#ffffff', fontFamily: "Georgia, serif"}}>Maryville Payroll System</Title>
            </Flex> */}

            <Flex style={rightHalfStyle}>
                <Flex style={cardStyle} className='loginContainer'>

                        <Title level={1} style={{textAlign: 'left', marginBottom: 18, color: 'var(--brand)'}}>Login</Title>


                    <Input
                        name="email"
                        placeholder="Email"
                        value={credentials.email}
                        onChange={handleInputChange}
                        autoComplete="username"
                        style={{ marginBottom: 12 }}
                    />

                    <Input.Password
                        name="password"
                        placeholder="Password"
                        value={credentials.password}
                        onChange={handleInputChange}
                        autoComplete="current-password"
                        style={{ marginBottom: 16 }}
                    />

                    <Button style={{ backgroundColor: 'var(--brand)', borderColor: 'var(--brand)', marginBottom: 10 }} type="primary" htmlType="submit" loading={isSubmitting} block>
                        Login
                    </Button>
                    <Checkbox><Typography style={{fontSize: 11, color: 'var(--brand)', justifyContent: 'center', alignItems: 'center'  }}>Remember Me</Typography></Checkbox>

                </Flex>
            </Flex>
        </Flex>
    )

}
