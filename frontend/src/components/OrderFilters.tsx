import React, { useState, useEffect } from 'react';
import {
    Drawer,
    Form,
    DatePicker,
    InputNumber,
    Select,
    Checkbox,
    Button,
    Space,
    Divider,
    Row,
    Col,
    Input,
} from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { ORDER_STATUSES } from '../types';

const { RangePicker } = DatePicker;
const { Option } = Select;

interface OrderFiltersProps {
    visible: boolean;
    onClose: () => void;
    onApply: (filters: any) => void;
    managers?: Array<{ id: number; name: string }>;
    tags?: Array<{ id: number; name: string; color?: string }>;
}

const STORAGE_KEY = 'crm_order_filters';

const OrderFilters: React.FC<OrderFiltersProps> = ({
    visible,
    onClose,
    onApply,
    managers = [],
    tags = [],
}) => {
    const [form] = Form.useForm();

    // Load saved filters on mount
    React.useEffect(() => {
        try {
            const savedFilters = localStorage.getItem(STORAGE_KEY);
            if (savedFilters) {
                const parsed = JSON.parse(savedFilters);

                // Convert date strings back to dayjs objects
                if (parsed.dateRange) {
                    parsed.dateRange = [
                        dayjs(parsed.dateRange[0]),
                        dayjs(parsed.dateRange[1])
                    ];
                }

                form.setFieldsValue(parsed);
            }
        } catch (e) {
            console.error('Error loading saved filters:', e);
        }
    }, [form]);

    const handleApply = () => {
        const values = form.getFieldsValue();

        // Convert date range to ISO strings
        const filters: any = {};

        if (values.dateRange && values.dateRange[0] && values.dateRange[1]) {
            filters.dateFrom = values.dateRange[0].startOf('day').toISOString();
            filters.dateTo = values.dateRange[1].endOf('day').toISOString();
        }

        if (values.amountMin !== undefined && values.amountMin !== null) {
            filters.amountMin = values.amountMin;
        }

        if (values.amountMax !== undefined && values.amountMax !== null) {
            filters.amountMax = values.amountMax;
        }

        if (values.currency) {
            filters.currency = values.currency;
        }

        if (values.amountOutputMin !== undefined && values.amountOutputMin !== null) {
            filters.amountOutputMin = values.amountOutputMin;
        }

        if (values.amountOutputMax !== undefined && values.amountOutputMax !== null) {
            filters.amountOutputMax = values.amountOutputMax;
        }

        if (values.currencyOutput) {
            filters.currencyOutput = values.currencyOutput;
        }

        if (values.location) {
            filters.location = values.location;
        }

        if (values.sources && values.sources.length > 0) {
            filters.sources = values.sources;
        }

        if (values.closedBy) {
            filters.closedBy = values.closedBy;
        }

        if (values.statuses && values.statuses.length > 0) {
            filters.statuses = values.statuses;
        }

        if (values.tags && values.tags.length > 0) {
            filters.tags = values.tags;
        }

        // Save to localStorage
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
        } catch (e) {
            console.error('Error saving filters:', e);
        }

        onApply(filters);
        onClose();
    };

    const handleReset = () => {
        form.resetFields();

        // Clear from localStorage
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.error('Error clearing filters:', e);
        }

        onApply({});
        onClose();
    };

    return (
        <Drawer
            title={
                <Space>
                    <FilterOutlined />
                    Фильтры
                </Space>
            }
            placement="right"
            onClose={onClose}
            open={visible}
            width={400}
            footer={
                <Row gutter={8}>
                    <Col span={12}>
                        <Button block onClick={handleReset}>
                            Сбросить
                        </Button>
                    </Col>
                    <Col span={12}>
                        <Button block type="primary" onClick={handleApply}>
                            Применить
                        </Button>
                    </Col>
                </Row>
            }
        >
            <Form form={form} layout="vertical">
                <Form.Item name="dateRange" label="Дата создания">
                    <RangePicker
                        style={{ width: '100%' }}
                        format="DD.MM.YYYY"
                        placeholder={['От', 'До']}
                    />
                </Form.Item>

                <Divider />

                <Form.Item label="Сумма сделки">
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="amountMin" noStyle>
                            <InputNumber
                                style={{ width: '50%' }}
                                placeholder="Минимум"
                                min={0}
                            />
                        </Form.Item>
                        <Form.Item name="amountMax" noStyle>
                            <InputNumber
                                style={{ width: '50%' }}
                                placeholder="Максимум"
                                min={0}
                            />
                        </Form.Item>
                    </Space.Compact>
                </Form.Item>

                <Form.Item name="currency" label="Валюта (отдает)">
                    <Select placeholder="Выберите валюту" allowClear>
                        <Option value="RUB">RUB (₽)</Option>
                        <Option value="EUR">EUR (€)</Option>
                        <Option value="USD">USD ($)</Option>
                        <Option value="USDT">USDT</Option>
                    </Select>
                </Form.Item>

                <Form.Item label="Клиент получает">
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item name="amountOutputMin" noStyle>
                            <InputNumber
                                style={{ width: '50%' }}
                                placeholder="Минимум"
                                min={0}
                            />
                        </Form.Item>
                        <Form.Item name="amountOutputMax" noStyle>
                            <InputNumber
                                style={{ width: '50%' }}
                                placeholder="Максимум"
                                min={0}
                            />
                        </Form.Item>
                    </Space.Compact>
                </Form.Item>

                <Form.Item name="currencyOutput" label="Валюта (получает)">
                    <Select placeholder="Выберите валюту" allowClear>
                        <Option value="RUB">RUB (₽)</Option>
                        <Option value="EUR">EUR (€)</Option>
                        <Option value="USD">USD ($)</Option>
                        <Option value="USDT">USDT</Option>
                    </Select>
                </Form.Item>

                <Form.Item name="location" label="Геолокация">
                    <Input placeholder="Город или страна" allowClear />
                </Form.Item>

                <Divider />

                <Form.Item name="sources" label="Источник">
                    <Checkbox.Group style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Checkbox value="telegram">Telegram</Checkbox>
                        <Checkbox value="telegram_bot">Telegram Bot</Checkbox>
                        <Checkbox value="bubble">Bubble</Checkbox>
                        <Checkbox value="manual">Вручную</Checkbox>
                        <Checkbox value="import">Импорт</Checkbox>
                    </Checkbox.Group>
                </Form.Item>

                <Divider />

                <Form.Item name="closedBy" label="Кем закрыта">
                    <Select placeholder="Выберите менеджера" allowClear showSearch>
                        {managers.map((m) => (
                            <Option key={m.id} value={m.id}>
                                {m.name}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>

                <Divider />

                <Form.Item name="statuses" label="Статусы">
                    <Select
                        mode="multiple"
                        placeholder="Выберите статусы"
                        allowClear
                        options={Object.entries(ORDER_STATUSES).map(([key, val]) => ({
                            label: `${val.icon} ${val.label}`,
                            value: key,
                        }))}
                    />
                </Form.Item>

                <Form.Item name="tags" label="Теги">
                    <Select
                        mode="multiple"
                        placeholder="Выберите теги"
                        allowClear
                        showSearch
                        filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={tags.map((tag) => ({
                            label: tag.name,
                            value: tag.id,
                        }))}
                    />
                </Form.Item>
            </Form>
        </Drawer>
    );
};

export default OrderFilters;
