import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Modal, Alert, Typography, Space, Divider } from 'antd';
import { LockOutlined, MailOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';


const { Text, Title } = Typography;

const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [resetModalVisible, setResetModalVisible] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [resetForm] = Form.useForm();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Проверяем если пришли с expired=1 (сессия истекла)
  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      setSessionExpired(true);
      message.warning('Сессия истекла. Войдите снова.');
      // Убираем параметр из URL
      window.history.replaceState({}, '', '/login');
    }
  }, [searchParams]);

  const getErrorMessage = (error: any): string => {
    const serverError = error.response?.data?.error;

    if (serverError) {
      // Маппинг серверных ошибок на понятные сообщения
      if (serverError.includes('Invalid login credentials') || serverError.includes('Неверный')) {
        return 'Неверный email или пароль. Проверьте введённые данные.';
      }
      if (serverError.includes('User not found') || serverError.includes('не найден')) {
        return 'Пользователь с таким email не найден.';
      }
      if (serverError.includes('Email already') || serverError.includes('уже существует')) {
        return 'Пользователь с таким email уже зарегистрирован.';
      }
      if (serverError.includes('password') || serverError.includes('пароль')) {
        return 'Неверный пароль. Попробуйте ещё раз или восстановите пароль.';
      }
      return serverError;
    }

    if (error.code === 'ERR_NETWORK') {
      return 'Ошибка сети. Проверьте подключение к интернету.';
    }

    return 'Произошла ошибка. Попробуйте позже.';
  };

  const onLogin = async (values: { email: string; password: string }) => {
    setLoading(true);
    setLoginError(null);
    try {
      await login(values.email, values.password);
      message.success('Добро пожаловать!');
      navigate('/orders');
    } catch (error: any) {
      const errorMsg = getErrorMessage(error);
      setLoginError(errorMsg);
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };



  const handleResetPassword = async (values: { email: string }) => {
    setResetLoading(true);
    try {
      await authAPI.forgotPassword(values.email);
      setResetSent(true);
      message.success('Инструкции отправлены на указанный email');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Не удалось отправить инструкции');
    } finally {
      setResetLoading(false);
    }
  };

  const openResetModal = () => {
    setResetSent(false);
    resetForm.resetFields();
    setResetModalVisible(true);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 420,
          margin: '0 16px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          borderRadius: 12
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0, color: '#1890ff' }}>MINI CRM</Title>
          <Text type="secondary">Система управления клиентами</Text>
        </div>

        {sessionExpired && (
          <Alert
            message="Сессия истекла"
            description="Ваша сессия завершилась. Пожалуйста, войдите снова."
            type="warning"
            showIcon
            closable
            onClose={() => setSessionExpired(false)}
            style={{ marginBottom: 16 }}
          />
        )}

        {loginError && (
          <Alert
            message={loginError}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            closable
            onClose={() => setLoginError(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <div style={{ padding: '0 24px' }}>
          <Title level={4} style={{ textAlign: 'center', marginBottom: 24 }}>Вход в систему</Title>
          <Form onFinish={onLogin} layout="vertical">
            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Введите email' },
                { type: 'email', message: 'Неверный формат email' }
              ]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Email"
                size="large"
                autoComplete="email"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: 'Введите пароль' }]}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
                placeholder="Пароль"
                size="large"
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 12 }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
              >
                Войти
              </Button>
            </Form.Item>

            <div style={{ textAlign: 'center' }}>
              <Button
                type="link"
                onClick={openResetModal}
                style={{ padding: 0 }}
              >
                Забыли пароль?
              </Button>
            </div>
          </Form>
        </div>

        <Divider style={{ margin: '16px 0' }} />

        <div style={{ textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            © 2025 MINI CRM. Все права защищены.
          </Text>
        </div>
      </Card>

      {/* Модальное окно восстановления пароля */}
      <Modal
        title="Восстановление пароля"
        open={resetModalVisible}
        onCancel={() => setResetModalVisible(false)}
        footer={null}
        destroyOnClose
      >
        {resetSent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Alert
              message="Письмо отправлено!"
              description="Инструкции по восстановлению пароля отправлены на указанный email. Проверьте почту (включая папку «Спам»)."
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Button onClick={() => setResetModalVisible(false)}>
              Закрыть
            </Button>
          </div>
        ) : (
          <Form form={resetForm} onFinish={handleResetPassword} layout="vertical">
            <Alert
              message="Введите email, указанный при регистрации"
              description="Мы отправим вам ссылку для сброса пароля."
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Введите email' },
                { type: 'email', message: 'Неверный формат email' }
              ]}
            >
              <Input
                prefix={<MailOutlined />}
                placeholder="Email"
                size="large"
                autoFocus
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                <Button onClick={() => setResetModalVisible(false)}>
                  Отмена
                </Button>
                <Button type="primary" htmlType="submit" loading={resetLoading}>
                  Отправить инструкции
                </Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Modal>
    </div>
  );
};

export default Login;
