import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';
import { Collaborator } from '../types';

const CollaboratorCard = ({ collaborator }: { collaborator: Collaborator }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6">{collaborator.first_name} {collaborator.last_name}</Typography>
        <Typography variant="body2">{collaborator.email}</Typography>
      </CardContent>
    </Card>
  );
};

export default CollaboratorCard;