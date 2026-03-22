/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Reset your password — ROTOVIDE</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={logoSection}>
          <div style={logoCircle}>
            <div style={playTriangle} />
          </div>
        </Section>
        <Section style={brandSection}>
          <span style={brandWhite}>ROTO</span>
          <span style={brandYellow}>VIDE</span>
        </Section>
        <Text style={tagline}>AI-Powered Music Video Editing</Text>
        <div style={divider} />
        <Heading as="h2" style={h2}>Reset Your Password</Heading>
        <Text style={text}>
          We received a request to reset your ROTOVIDE password. Click the
          button below to choose a new one. This link expires in 1 hour.
        </Text>
        <Section style={buttonSection}>
          <Button style={button} href={confirmationUrl}>
            RESET MY PASSWORD →
          </Button>
        </Section>
        <div style={dividerLight} />
        <Text style={footer}>
          IF YOU DIDN'T REQUEST A PASSWORD RESET, IGNORE THIS EMAIL.
          YOUR PASSWORD WILL NOT BE CHANGED.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

const main = { backgroundColor: '#ffffff', fontFamily: "'Arial', sans-serif" }
const container = {
  backgroundColor: '#080808',
  padding: '48px 32px',
  maxWidth: '480px',
  margin: '0 auto',
}
const logoSection = { textAlign: 'center' as const, marginBottom: '20px' }
const logoCircle = {
  display: 'inline-block',
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  backgroundColor: '#1A1A1A',
  border: '1px solid rgba(232,255,71,0.2)',
  textAlign: 'center' as const,
  lineHeight: '56px',
}
const playTriangle = {
  display: 'inline-block',
  width: '0',
  height: '0',
  borderTop: '10px solid transparent',
  borderBottom: '10px solid transparent',
  borderLeft: '16px solid #E8FF47',
  marginLeft: '4px',
  verticalAlign: 'middle',
}
const brandSection = { textAlign: 'center' as const, marginBottom: '6px' }
const brandWhite = {
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: '28px',
  fontWeight: '900' as const,
  color: '#F2EDE4',
  letterSpacing: '4px',
}
const brandYellow = {
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: '28px',
  fontWeight: '900' as const,
  color: '#E8FF47',
  letterSpacing: '4px',
}
const tagline = {
  fontSize: '10px',
  letterSpacing: '3px',
  color: 'rgba(242,237,228,0.35)',
  textTransform: 'uppercase' as const,
  margin: '0 0 40px',
  fontFamily: "'Courier New', monospace",
  textAlign: 'center' as const,
}
const divider = { borderTop: '1px solid rgba(242,237,228,0.08)', marginBottom: '40px' }
const dividerLight = { borderTop: '1px solid rgba(242,237,228,0.06)', marginBottom: '24px' }
const h2 = {
  fontFamily: "Arial Black, Arial, sans-serif",
  fontSize: '22px',
  fontWeight: '900' as const,
  color: '#F2EDE4',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  margin: '0 0 12px',
}
const text = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: 'rgba(242,237,228,0.55)',
  margin: '0 0 32px',
}
const buttonSection = { textAlign: 'center' as const, marginBottom: '40px' }
const button = {
  backgroundColor: '#E8FF47',
  color: '#080808',
  textDecoration: 'none',
  padding: '14px 40px',
  fontFamily: "Arial Black, Arial, sans-serif",
  fontWeight: '900' as const,
  fontSize: '14px',
  letterSpacing: '2px',
  textTransform: 'uppercase' as const,
  borderRadius: '4px',
}
const footer = {
  fontSize: '11px',
  color: 'rgba(242,237,228,0.2)',
  textAlign: 'center' as const,
  margin: '0',
  lineHeight: '1.6',
  fontFamily: "'Courier New', monospace",
  letterSpacing: '1px',
}
