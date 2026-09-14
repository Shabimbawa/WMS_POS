import { Card, type CardProps, Flex, Typography } from 'antd'
import { type CSSProperties } from 'react'

interface AppCardProps extends CardProps {
  style?: CSSProperties
  title?: string
  subtitle?: string
}

export function AppCard({ children, style, title, subtitle, ...rest }: AppCardProps) {
  const {Title}=Typography;
  return (
    <Card
      bordered={false}
      style={{ borderRadius: 1, width: '100%', padding: 10, ...style }}
      title={
        title ? (
          <Flex vertical style={{paddingBottom: 10}}>
            <Flex >
              <Title level={4}>{title}</Title>
            </Flex>
            {subtitle && (
              <Flex style={{ fontSize: 14, fontWeight: 400, marginTop: 4 }}>
                {subtitle}
              </Flex>
            )}
          </Flex>
        ) : undefined
      }
      {...rest}
    >
      {children}
    </Card>
  )
}