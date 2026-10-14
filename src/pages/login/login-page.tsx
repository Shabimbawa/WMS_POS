import { Input, Typography, Button, Switch, Tooltip } from 'antd';
import { LockOutlined, MoonOutlined, SunOutlined, UserOutlined } from '@ant-design/icons';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ErrorNotificationPopup } from '../../common/items/notification/errror-notif';
import { currentUserQueryKey } from './auth-useQuery';
import { getLandingPath } from '../../common/components/sidebar/nav-items';
import { login } from '../../queries/auth';
import { LanguageToggle, useLanguage } from '../../common/context/language-context';
import { useTheme } from '../../common/context/theme-context';

export interface LoginCredentials {
  email: string;
  password:  string;
}

export default function LoginPage() {
  const { t } = useLanguage();
  const { mode, toggleTheme } = useTheme();
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
      const user = await login(credentials.email, credentials.password);
      queryClient.clear();
      queryClient.setQueryData(currentUserQueryKey, user);
      navigate(getLandingPath(user.role), { replace: true });
    } catch (error) {
      showError(error, t('Login Failed'));
    } finally {
      setIsSubmitting(false);
    }
  };



  return (
    <main className="login-page">
      {contextHolder}

      <section className="login-brand-panel" aria-label={t('Wensor Trading inventory system')}>
        <div className="login-brand-lockup">
          <div className="login-brand-mark" aria-hidden="true">WT</div>
          <Typography.Text className="login-company-name">Wensor Trading</Typography.Text>
        </div>
        <div className="login-brand-message">
          <Typography.Title level={1}>{t('Inventory, receiving, and sales in one place.')}</Typography.Title>
          <Typography.Paragraph>
            {t('A secure workspace for Wensor Trading warehouse and point-of-sale operations.')}
          </Typography.Paragraph>
        </div>
        <Typography.Text className="login-panel-footer">{t('Inventory Management System')}</Typography.Text>
      </section>

      <section className="login-form-panel">
        <div className="login-preferences">
          <LanguageToggle />
          <Tooltip title={t(mode === 'dark' ? 'Use light theme' : 'Use dark theme')}>
            <Switch
              size="small"
              checked={mode === 'dark'}
              onChange={toggleTheme}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
              aria-label={t('Toggle color theme')}
            />
          </Tooltip>
        </div>

        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-mobile-brand">
            <div className="login-brand-mark" aria-hidden="true">WT</div>
            <Typography.Text strong>Wensor Trading</Typography.Text>
          </div>
          <Typography.Title level={2} className="login-title">{t('Welcome back')}</Typography.Title>
          <Typography.Paragraph className="login-description">
            {t('Sign in with your assigned account to continue.')}
          </Typography.Paragraph>

          <label className="login-field">
            <span>{t('Email')}</span>
            <Input
              name="email"
              type="email"
              size="large"
              prefix={<UserOutlined />}
              placeholder={t('Enter your email address')}
              value={credentials.email}
              onChange={handleInputChange}
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="login-field">
            <span>{t('Password')}</span>
            <Input.Password
              name="password"
              size="large"
              prefix={<LockOutlined />}
              placeholder={t('Enter your password')}
              value={credentials.password}
              onChange={handleInputChange}
              autoComplete="current-password"
              required
            />
          </label>

          <Button className="login-submit" type="primary" htmlType="submit" loading={isSubmitting} size="large" block>
            {t('Sign in')}
          </Button>
          <Typography.Text className="login-help">
            {t('Account access is managed by your administrator.')}
          </Typography.Text>
        </form>
      </section>
    </main>
  )

}
