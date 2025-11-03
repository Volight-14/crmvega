import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const ContactsPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Контакты</Title>
      <Card>
        <p>Здесь будет список контактов с поиском. В разработке...</p>
      </Card>
    </div>
  );
};

export default ContactsPage;

