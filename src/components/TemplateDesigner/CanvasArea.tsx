"use client"
import { Stage, Layer, Text, Rect, Image as KonvaImage, Transformer } from "react-konva"
import { useRef, useEffect, useState } from "react"
import { TemplateElement } from "./Designer"
import useImage from 'use-image'

// Temporary placeholder for testing rendering
const QR_PLACEHOLDER = "https://th.bing.com/th/id/OIP.XJ1EaY9U6K3xL4fW8N1Y-gHaHa?rs=1&pid=ImgDetMain"
const IMG_PLACEHOLDER = "https://via.placeholder.com/150"

const ElementRenderer = ({ shapeProps, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>()
  const trRef = useRef<any>()

  const [image] = useImage(shapeProps.type === 'QR' ? QR_PLACEHOLDER : IMG_PLACEHOLDER)

  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current])
      trRef.current.getLayer().batchDraw()
    }
  }, [isSelected])

  const dragProps = {
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: any) => {
      onChange({
        ...shapeProps,
        x: e.target.x(),
        y: e.target.y(),
      })
    },
    onTransformEnd: (e: any) => {
      const node = shapeRef.current
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()

      node.scaleX(1)
      node.scaleY(1)
      onChange({
        ...shapeProps,
        x: node.x(),
        y: node.y(),
        width: Math.max(5, node.width() * scaleX),
        height: Math.max(5, node.height() * scaleY),
        rotation: node.rotation()
      })
    }
  }

  return (
    <>
      {shapeProps.type === 'TEXT' && (
        <Text
          ref={shapeRef}
          {...shapeProps}
          {...dragProps}
          text={shapeProps.content}
        />
      )}
      {(shapeProps.type === 'IMAGE' || shapeProps.type === 'QR') && (
        <KonvaImage
          ref={shapeRef}
          {...shapeProps}
          {...dragProps}
          image={image}
        />
      )}
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) return oldBox
            return newBox
          }}
        />
      )}
    </>
  )
}

export default function CanvasArea({ config, selectedId, setSelectedId, updateElement }: any) {
  // Scale down the canvas so it fits nicely on screen. E.g standard CR80 is 600x950 pixels (300dpi)
  const scale = 0.5

  return (
    <Stage 
      width={config.width * scale} 
      height={config.height * scale} 
      scale={{ x: scale, y: scale }}
      onMouseDown={(e) => {
        // deselect when clicking on empty area
        const clickedOnEmpty = e.target === e.target.getStage()
        if (clickedOnEmpty) {
          setSelectedId(null)
        }
      }}
    >
      <Layer>
        {/* Background layer */}
        <Rect
          x={0}
          y={0}
          width={config.width}
          height={config.height}
          fill={config.background}
          listening={false}
        />
        
        {config.elements.map((el: TemplateElement) => (
          <ElementRenderer
            key={el.id}
            shapeProps={el}
            isSelected={el.id === selectedId}
            onSelect={() => setSelectedId(el.id)}
            onChange={(newProps: any) => updateElement(el.id, newProps)}
          />
        ))}
      </Layer>
    </Stage>
  )
}
