/**
 * Header — Top bar with project title and download actions
 */

import { useState } from 'react';
import { colors, fonts } from '../styles/theme';
import { HttpTileLoader } from '../services/tileLoader';

interface HeaderProps {
  projectName: string;
  tileLoader: HttpTileLoader;
}

export function Header({ projectName, tileLoader }: HeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      height: '44px',
      backgroundColor: colors.bgHeader,
      color: colors.textPrimary,
      display: 'flex',
      alignItems: 'center',
      padding: '0 16px',
      borderBottom: `1px solid ${colors.border}`,
      flexShrink: 0,
      gap: '12px',
    }}>
      <span style={{ fontWeight: 'bold', fontSize: fonts.sizeXl }}>StraboMicro</span>
      <span style={{ color: colors.textDim }}>|</span>
      <span style={{ fontSize: fonts.sizeLg, color: colors.textMuted, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {projectName}
      </span>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <HeaderButton href={tileLoader.getPdfUrl()} label="PDF" />
        <HeaderButton href={tileLoader.getSmzUrl()} label="SMZ" />
        <button
          onClick={handleShare}
          style={{
            background: 'none',
            border: `1px solid ${colors.border}`,
            color: copied ? colors.success : colors.textLink,
            padding: '4px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: fonts.sizeSm,
            transition: 'color 0.15s',
          }}
        >
          {copied ? 'Copied!' : 'Share'}
        </button>
      </div>
    </div>
  );
}

function HeaderButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download
      style={{
        color: colors.textLink,
        textDecoration: 'none',
        fontSize: fonts.sizeSm,
        border: `1px solid ${colors.border}`,
        padding: '4px 10px',
        borderRadius: '4px',
      }}
    >
      {label}
    </a>
  );
}
