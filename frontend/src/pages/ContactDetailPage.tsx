import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const ContactDetailPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Карточка контакта</Title>
      <Card>
        <p>Здесь будет детальная карточка контакта с вкладками. В разработке...</p>
      </Card>
    </div>
  );
};

export default ContactDetailPage;

