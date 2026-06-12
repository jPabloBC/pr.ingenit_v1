import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { Collaborator } from '../types';

const CollaboratorsTable = ({ collaborators }: { collaborators: Collaborator[] }) => {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>Nombre</TableCell>
          <TableCell>Email</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {collaborators.map((collaborator) => (
          <TableRow key={collaborator.id}>
            <TableCell>{collaborator.first_name} {collaborator.last_name}</TableCell>
            <TableCell>{collaborator.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default CollaboratorsTable;