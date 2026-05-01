import React from "react";
import { Box, Text, useStdout } from "ink";

type PanelProps = {
  title?: string;
  titleColor?: string;
  height?: number;
  minHeight?: number;
  children: React.ReactNode;
};

export const Panel = ({ title, titleColor = "cyan", height, minHeight, children }: PanelProps) => (
  <Box width="100%" height={height} minHeight={minHeight} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} paddingY={0}>
    {title ? (
      <Box>
        <Text color={titleColor}>{title}</Text>
      </Box>
    ) : null}
    {children}
  </Box>
);

type BadgeProps = {
  label: string;
  color?: string;
};

export const Badge = ({ label, color = "white" }: BadgeProps) => (
  <Text color={color}>
    [<Text bold>{label}</Text>]
  </Text>
);

type MeterProps = {
  current: number;
  total: number;
  width?: number;
};

export const Meter = ({ current, total, width = 24 }: MeterProps) => {
  const safeTotal = total <= 0 ? 1 : total;
  const ratio = Math.max(0, Math.min(1, current / safeTotal));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);

  return (
    <Text>
      <Text color="green">{"=".repeat(filled)}</Text>
      <Text color="gray">{"-".repeat(empty)}</Text>
      <Text> {current}/{total}</Text>
    </Text>
  );
};

type KeyHintsProps = {
  items: string[];
};

export const KeyHints = ({ items }: KeyHintsProps) => (
  <Box width="100%" flexWrap="wrap">
    {items.map((item, index) => (
      <Box key={item} marginRight={index === items.length - 1 ? 0 : 2}>
        <Text color="gray">{item}</Text>
      </Box>
    ))}
  </Box>
);

type ScreenFrameProps = {
  title: string;
  subtitle?: string;
  badges?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export const ScreenFrame = ({ title, subtitle, badges, footer, children }: ScreenFrameProps) => (
  <ScreenFrameInner title={title} subtitle={subtitle} badges={badges} footer={footer}>
    {children}
  </ScreenFrameInner>
);

const ScreenFrameInner = ({ title, subtitle, badges, footer, children }: ScreenFrameProps) => {
  const { stdout } = useStdout();
  const rows = stdout.rows ?? 40;

  return (
    <Box width="100%" height={rows} flexDirection="column">
      <Box
        width="100%"
        borderStyle="single"
        borderColor="cyan"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        paddingX={1}
      >
        <Box width="100%" justifyContent="space-between">
          <Box flexDirection="column">
            <Text color="cyanBright">{title}</Text>
            {subtitle ? <Text color="gray">{subtitle}</Text> : null}
          </Box>
          {badges ? <Box>{badges}</Box> : null}
        </Box>
      </Box>
      <Box width="100%" flexGrow={1} flexDirection="column">
        {children}
      </Box>
      {footer ? (
        <Box
          width="100%"
          borderStyle="single"
          borderColor="gray"
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          paddingX={1}
        >
          <Box width="100%">
            {footer}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
};

export const getContentWidth = (padding = 10): number => Math.max(24, (process.stdout.columns ?? 120) - padding);

export const truncateMiddle = (value: string, maxLength = 88): string => {
  if (value.length <= maxLength) {
    return value;
  }

  const head = Math.ceil((maxLength - 3) / 2);
  const tail = Math.floor((maxLength - 3) / 2);
  return `${value.slice(0, head)}...${value.slice(value.length - tail)}`;
};
