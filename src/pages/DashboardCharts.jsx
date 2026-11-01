import { BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { ArrowRight, BarChart3, Brain, Clock3 } from 'lucide-react'
import { Card } from '../components/ui'

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler)

const chartFont = { family: 'Inter, sans-serif', size: 10 }
const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: 'index' },
  plugins: {
    legend: {
      position: 'bottom',
      labels: { color: '#777187', boxWidth: 9, boxHeight: 9, usePointStyle: true, pointStyle: 'circle', padding: 14, font: chartFont },
    },
    tooltip: {
      backgroundColor: '#302a40',
      titleFont: { ...chartFont, weight: '600' },
      bodyFont: chartFont,
      padding: 10,
      cornerRadius: 7,
    },
  },
  scales: {
    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#8a8494', font: chartFont } },
    y: { beginAtZero: true, border: { display: false }, grid: { color: '#f0edf4', drawTicks: false }, ticks: { color: '#96909f', padding: 8, font: chartFont } },
  },
}
const horizontalChartOptions = {
  ...chartOptions,
  indexAxis: 'y',
  scales: {
    x: { beginAtZero: true, border: { display: false }, grid: { color: '#f0edf4', drawTicks: false }, ticks: { color: '#96909f', padding: 8, font: chartFont } },
    y: { grid: { display: false }, border: { display: false }, ticks: { color: '#8a8494', font: chartFont } },
  },
  plugins: { ...chartOptions.plugins, legend: { display: false } },
}

function weekday(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
}

function PanelHeading({ icon: Icon, title, subtitle, link, linkLabel }) {
  return <div className="dashboard-panel-heading">
    <div className="panel-heading-icon"><Icon size={15} /></div>
    <div className="panel-heading-copy"><h3>{title}</h3><p>{subtitle}</p></div>
    <a href={link}>{linkLabel} <ArrowRight size={12} /></a>
  </div>
}

function ChartEmpty({ text }) {
  return <div className="dashboard-chart-empty"><BarChart3 size={19} /><span>{text}</span></div>
}

export default function DashboardCharts({ data }) {
  const studyChart = {
    labels: data.daily_study.map((day) => weekday(day.study_date)),
    datasets: [
      {
        label: 'Planned minutes',
        data: data.daily_study.map((day) => day.planned_minutes),
        backgroundColor: '#d9cff8',
        borderRadius: 4,
        maxBarThickness: 22,
      },
      {
        label: 'Actual minutes',
        data: data.daily_study.map((day) => day.actual_minutes),
        backgroundColor: '#7656e8',
        borderRadius: 4,
        maxBarThickness: 22,
      },
    ],
  }
  const subjectChart = {
    labels: data.subject_duration.map((subject) => subject.subject_name),
    datasets: [{
      label: 'Study minutes',
      data: data.subject_duration.map((subject) => subject.total_minutes),
      backgroundColor: ['#7656e8', '#a58bff', '#c4b4f4', '#e1dafa', '#9880d8'],
      borderRadius: 4,
      maxBarThickness: 28,
    }],
  }
  const assessmentChart = {
    labels: data.assessment_trend.map((day) => weekday(day.date)),
    datasets: [{
      label: 'Average evidence score',
      data: data.assessment_trend.map((day) => day.average_evidence_score),
      borderColor: '#7656e8',
      backgroundColor: 'rgba(165, 139, 255, .16)',
      pointBackgroundColor: '#7656e8',
      pointBorderColor: '#fff',
      pointBorderWidth: 2,
      pointRadius: 3,
      fill: true,
      tension: 0.32,
      spanGaps: false,
    }],
  }

  return <div className="dashboard-chart-grid">
    <Card className="dashboard-panel chart-panel">
      <PanelHeading icon={BarChart3} title="Planned vs actual study" subtitle="Minutes per day" link="/analytics" linkLabel="Analytics" />
      {data.daily_study.some((day) => day.planned_minutes || day.actual_minutes) ? <div className="dashboard-chart"><Bar data={studyChart} options={chartOptions} /></div> : <ChartEmpty text="Study plan and session activity will appear here." />}
    </Card>
    <Card className="dashboard-panel chart-panel">
      <PanelHeading icon={Clock3} title="Subject study time" subtitle="Recorded session duration this week" link="/study-sessions" linkLabel="Sessions" />
      {data.subject_duration.some((subject) => subject.total_minutes) ? <div className="dashboard-chart"><Bar data={subjectChart} options={horizontalChartOptions} /></div> : <ChartEmpty text="No study sessions recorded this week." />}
    </Card>
    <Card className="dashboard-panel chart-panel chart-panel-wide">
      <PanelHeading icon={Brain} title="Assessment performance" subtitle="Average evidence score by assessment date" link="/knowledge" linkLabel="Knowledge analysis" />
      {data.assessment_trend.some((day) => day.average_evidence_score != null) ? <div className="dashboard-chart dashboard-trend-chart"><Line data={assessmentChart} options={{ ...chartOptions, scales: { ...chartOptions.scales, y: { ...chartOptions.scales.y, min: 0, max: 100 } } }} /></div> : <ChartEmpty text="Scored assessment attempts will appear here over time." />}
    </Card>
  </div>
}
