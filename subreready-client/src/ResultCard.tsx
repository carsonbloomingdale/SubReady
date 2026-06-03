import React from 'react';

interface ResultCardProps {
  status: 'green' | 'amber' | 'red';
  reason: string;
  nextStep: string;
}

const statusColors = {
  green: 'bg-green-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500'
};

const statusText = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red'
};

export default function ResultCard({ status, reason, nextStep }: ResultCardProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1117] p-4">
      <div className="w-full max-w-md bg-[#1a1d24] rounded-2xl p-8 shadow-2xl">
        <div className={`w-20 h-20 mx-auto rounded-full ${statusColors[status]} flex items-center justify-center mb-6 shadow-lg`}>
          <span className="text-white text-3xl font-bold">{statusText[status]}</span>
        </div>
        
        <h2 className="text-2xl font-bold text-white mb-4">{statusText[status]}</h2>
        
        <div className="space-y-4">
          <div className="bg-[#0f1117] rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Reason</p>
            <p className="text-white font-semibold">{reason}</p>
          </div>
          
          <div className="bg-[#0f1117] rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-1">Next Step</p>
            <p className="text-white font-semibold">{nextStep}</p>
          </div>
        </div>
        
        <p className="text-gray-500 text-xs mt-6 text-center">
          Triage only — full verification pending when online
        </p>
      </div>
    </div>
  );
}

