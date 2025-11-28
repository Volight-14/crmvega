import React from 'react';
import { Typography } from 'antd';
import AISettingsTab from '../components/AISettingsTab';

const { Title } = Typography;

const AIAgentPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>AI Агент</Title>
      <AISettingsTab />
    </div>
  );
};

export default AIAgentPage;

