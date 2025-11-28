import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, message, Alert, Typography, Result, Spin } from 'antd';
import { LockOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

const { Title, Text } = Typography;

const ResetPassword: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [email, setEmail] = useState<string>('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setVerifying(false);
      setTokenError('Ссылка недействительна');
      return;
    }

    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const result = await authAPI.verifyResetToken(token!);
      if (result.valid) {
        setTokenValid(true);
        setEmail(result.email || '');
      } else {
        setTokenError(result.error || 'Ссылка недействительна');
      }
    } catch (error: any) {
      setTokenError(error.response?.data?.error || 'Ссылка недействительна или истекла');
    } finally {
      setVerifying(false);
    }
  };

  const onSubmit = async (values: { password: string }) => {
    if (!token) return;
    
    setLoading(true);
    try {
      await authAPI.resetPassword(token, values.password);
      setSuccess(true);
      message.success('Пароль успешно изменён!');
    } catch (error: any) {
      message.error(error.response?.data?.error || 'Ошибка сброса пароля');
    } finally {
      setLoading(false);
    }
  };

  if (verifying) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Card style={{ width: 420, textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Проверка ссылки...</Text>
          </div>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Card style={{ width: 420 }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            title="Пароль изменён!"
            subTitle="Теперь вы можете войти с новым паролем"
            extra={
              <Button type="primary" size="large" onClick={() => navigate('/login')}>
                Войти
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (tokenError || !tokenValid) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <Card style={{ width: 420 }}>
          <Result
            status="error"
            title="Ссылка недействительна"
            subTitle={tokenError || 'Ссылка для сброса пароля истекла или уже была использована'}
            extra={[
              <Button type="primary" key="login" onClick={() => navigate('/login')}>
                Вернуться ко входу
              </Button>
            ]}
          />
        </Card>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card style={{ width: 420, boxShadow: '0 10px 40px rgba(0,0,0,0.2)', borderRadius: 12 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>Новый пароль</Title>
          <Text type="secondary">для {email}</Text>
        </div>

        <Form onFinish={onSubmit} layout="vertical">
          <Form.Item
            name="password"
            rules={[
              { required: true, message: 'Введите новый пароль' },
              { min: 6, message: 'Минимум 6 символов' }
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Новый пароль"
              size="large"
              autoFocus
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Подтвердите пароль' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('Пароли не совпадают'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="Подтвердите пароль"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block
              size="large"
            >
              Сохранить пароль
            </Button>
          </Form.Item>

          <div style={{ textAlign: 'center' }}>
            <Button type="link" onClick={() => navigate('/login')}>
              Вернуться ко входу
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default ResetPassword;

