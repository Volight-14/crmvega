import React from 'react';
import { Typography, Card } from 'antd';

const { Title } = Typography;

const DealsPage: React.FC = () => {
  return (
    <div>
      <Title level={2}>Сделки</Title>
      <Card>
        <p>Здесь будет канбан-доска сделок. В разработке...</p>
      </Card>
    </div>
  );
};

export default DealsPage;

