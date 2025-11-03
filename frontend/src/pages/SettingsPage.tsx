import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const SettingsPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Настройки</Title>
      <Card>
        <p>Здесь будут настройки системы. В разработке...</p>
      </Card>
    </div>
  );
};

export default SettingsPage;

