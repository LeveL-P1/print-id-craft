"use client"
import dynamic from 'next/dynamic'

const Designer = dynamic(() => import('@/components/TemplateDesigner/Designer'), { ssr: false })

export default function TemplatesRoute() {
  return <Designer />
}
