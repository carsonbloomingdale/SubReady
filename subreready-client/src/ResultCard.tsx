interface ResultCardProps {
  status: 'green' | 'amber' | 'red';
  reason: string;
  nextStep: string;
  mistakes?: string[];
  parseWarnings?: string[];
  onReset?: () => void;
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

export default function ResultCard({
  status,
  reason,
  nextStep,
  mistakes,
  parseWarnings,
  onReset,
}: ResultCardProps) {
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

          {mistakes && mistakes.length > 0 && (
            <div className="bg-[#0f1117] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Issues found</p>
              <ul className="text-white text-sm space-y-1 list-disc list-inside">
                {mistakes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {parseWarnings && parseWarnings.length > 0 && (
            <div className="bg-[#0f1117] rounded-lg p-4">
              <p className="text-gray-400 text-sm mb-2">Parse notes</p>
              <ul className="text-amber-200/90 text-sm space-y-1 list-disc list-inside">
                {parseWarnings.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="mt-6 w-full px-4 py-2 border border-[#1D9E75] text-[#1D9E75] rounded-lg font-semibold hover:bg-[#1D9E75]/10 transition"
          >
            Upload another document
          </button>
        )}

        <p className="text-gray-500 text-xs mt-6 text-center">
          Triage only — full verification pending when online
        </p>
      </div>
    </div>
  );
}

