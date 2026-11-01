import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'

export function Button({ children, icon: Icon, variant = 'primary', className = '', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`} {...props}>
      {Icon && <Icon size={16} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }) {
  return <input className={`text-input ${className}`} {...props} />
}

export function Card({ children, className = '', ...props }) {
  return <section className={`surface-card ${className}`} {...props}>{children}</section>
}

export function ProgressBar({ value, className = '', ...props }) {
  return (
    <div className={`progress-track ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100" {...props}>
      <div className="progress-fill" style={{ '--progress': `${value}%` }} />
    </div>
  )
}

export function Dropdown({ trigger, children, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div className="dropdown-root" ref={rootRef}>
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open && <div className={`dropdown-panel dropdown-align-${align}`} onClick={() => setOpen(false)}>{children}</div>}
    </div>
  )
}

export function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return undefined
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

export function SelectMenu({ value, options, onChange }) {
  return (
    <label className="select-menu">
      <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
      <ChevronDown size={15} aria-hidden="true" />
      {value && <Check className="select-check" size={13} aria-hidden="true" />}
    </label>
  )
}
