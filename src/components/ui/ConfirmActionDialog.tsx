"use client";

import React from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { InfoOutlined, WarningAmberOutlined } from '@mui/icons-material';
import { colors } from '@/theme/theme';

type ConfirmActionVariant = 'info' | 'warning' | 'danger';

type ConfirmActionDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  variant?: ConfirmActionVariant;
  onCancel: () => void;
  onConfirm: () => void;
};

const variantStyles: Record<ConfirmActionVariant, { color: string; bg: string }> = {
  info: { color: colors.blue600, bg: alpha(colors.blue600, 0.1) },
  warning: { color: colors.gold2, bg: alpha(colors.gold3, 0.16) },
  danger: { color: colors.red500, bg: alpha(colors.red500, 0.1) },
};

export default function ConfirmActionDialog({
  open,
  title,
  message,
  detail,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loading = false,
  variant = 'info',
  onCancel,
  onConfirm,
}: ConfirmActionDialogProps) {
  const tone = variantStyles[variant];
  const Icon = variant === 'info' ? InfoOutlined : WarningAmberOutlined;

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onCancel}
      fullWidth
      maxWidth="xs"
      PaperProps={{
        sx: {
          borderRadius: 2,
          border: `1px solid ${colors.slate200}`,
          boxShadow: '0 18px 50px rgba(0, 26, 51, 0.2)',
        },
      }}
    >
      <DialogTitle sx={{ px: 2.25, pt: 2.1, pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 34,
              height: 34,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tone.color,
              bgcolor: tone.bg,
              flex: '0 0 auto',
            }}
          >
            <Icon sx={{ fontSize: 20 }} />
          </Box>
          <Typography sx={{ color: colors.blue1, fontSize: 18, fontWeight: 700, lineHeight: 1.2 }}>
            {title}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: 2.25, pt: '4px !important', pb: 1 }}>
        {message ? (
          <Typography sx={{ color: colors.slate700, fontSize: 14.5, lineHeight: 1.45 }}>
            {message}
          </Typography>
        ) : null}
        {detail ? (
          <Box
            sx={{
              mt: 1.25,
              px: 1.35,
              py: 1,
              borderRadius: 1,
              border: `1px solid ${colors.slate200}`,
              bgcolor: colors.slate50,
            }}
          >
            <Typography sx={{ color: colors.blue1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.35 }}>
              {detail}
            </Typography>
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2.25, pt: 1, pb: 2, gap: 1 }}>
        <Button
          onClick={onCancel}
          disabled={loading}
          variant="outlined"
          sx={{ minWidth: 104, height: 36 }}
        >
          {cancelLabel}
        </Button>
        <Button
          onClick={onConfirm}
          disabled={loading}
          variant="contained"
          sx={{ minWidth: 112, height: 36 }}
        >
          {loading ? 'Procesando...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
