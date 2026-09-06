import type { Team, Task, TeamScan } from '../types/database'

interface TeamProgressTableProps {
  teams: Team[]
  tasks: Task[]
  scans: TeamScan[]
  onToggleComplete: (scanId: string, completed: boolean) => void
  pointsEnabled?: boolean
}

export function TeamProgressTable({ teams, tasks, scans, onToggleComplete, pointsEnabled }: TeamProgressTableProps) {
  const getScan = (teamId: string, taskId: string) =>
    scans.find((s) => s.team_id === teamId && s.task_id === taskId)

  const getTeamPoints = (teamId: string) =>
    scans
      .filter(s => s.team_id === teamId && s.completed)
      .reduce((sum, s) => sum + (tasks.find(t => t.id === s.task_id)?.points || 0), 0)

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        No teams registered yet. Teams will appear here when they scan a QR code.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="text-left px-4 py-3 bg-gray-100 rounded-tl-xl font-medium text-gray-600">
              Team
            </th>
            {tasks.map((task) => (
              <th key={task.id} className="px-4 py-3 bg-gray-100 text-center">
                <div className="flex flex-col items-center gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: task.hex_code }}
                    />
                    <span className="font-medium text-gray-600 text-sm">{task.title}</span>
                  </div>
                  {pointsEnabled && task.points > 0 && (
                    <span className="text-xs text-amber-600 font-bold">{task.points} pts</span>
                  )}
                </div>
              </th>
            ))}
            {pointsEnabled && (
              <th className="px-4 py-3 bg-gray-100 rounded-tr-xl font-medium text-gray-600 text-center">
                Total
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const totalPts = getTeamPoints(team.id)
            return (
              <tr key={team.id} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{team.name}</td>
                {tasks.map((task) => {
                  const scan = getScan(team.id, task.id)
                  return (
                    <td key={task.id} className="px-4 py-3 text-center">
                      {scan ? (
                        <button
                          onClick={() => onToggleComplete(scan.id, !scan.completed)}
                          className={`w-10 h-10 rounded-full inline-flex items-center justify-center transition-all ${
                            scan.completed
                              ? 'bg-green-500 a-text hover:bg-green-600'
                              : 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                          }`}
                          title={scan.completed ? 'Completed — click to undo' : 'Scanned — click to mark complete'}
                        >
                          {scan.completed ? '✓' : '◎'}
                        </button>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )
                })}
                {pointsEnabled && (
                  <td className="px-4 py-3 text-center">
                    <span className="font-black text-amber-600 text-lg">{totalPts}</span>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
