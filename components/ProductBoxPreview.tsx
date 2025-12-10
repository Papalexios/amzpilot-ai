
import React from 'react';
import { ProductDetails } from '../types';

interface ProductBoxPreviewProps {
  product: ProductDetails;
}

export const ProductBoxPreview: React.FC<ProductBoxPreviewProps> = ({ product }) => {
  return (
    <div className="w-full max-w-[850px] mx-auto" style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      
      <div style={{
        background: 'rgba(255,255,255,0.9)',
        borderRadius: '20px',
        boxShadow: '0 20px 50px -12px rgba(0, 0, 0, 0.12)',
        border: '1px solid rgba(226, 232, 240, 0.8)',
        overflow: 'hidden',
        position: 'relative',
        margin: '20px 0',
        display: 'block'
      }}>

        {/* Glass Header */}
        <div style={{ background: 'linear-gradient(90deg, #f8fafc, #f1f5f9)', padding: '12px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ height: '8px', width: '8px', background: '#10b981', borderRadius: '50%', display: 'inline-block' }}></span>
                <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', color: '#64748b', letterSpacing: '1px' }}>Expert Verified</span>
            </div>
            <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '4px 12px', borderRadius: '99px' }}>
                {product.award || "Editor's Choice"}
            </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            
            {/* Image */}
            <div style={{ flex: 1, minWidth: '280px', padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#ffffff', borderRight: '1px solid #f1f5f9' }}>
                 <img src={product.imageUrl} alt={product.title} style={{ maxWidth: '100%', maxHeight: '220px', objectFit: 'contain' }} />
            </div>

            {/* Content */}
            <div style={{ flex: 1.4, minWidth: '320px', padding: '32px', display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.6)' }}>
                
                <div style={{ marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1.3, color: '#0f172a' }}>{product.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                        <span style={{ color: '#fbbf24', letterSpacing: '2px' }}>★★★★★</span>
                        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>{product.rating} / 5.0</span>
                        {product.prime && <span style={{ color: '#00a8e1', fontWeight: 900, fontSize: '10px', marginLeft: '6px', fontStyle: 'italic' }}>PRIME</span>}
                    </div>
                </div>

                <p style={{ fontSize: '0.95rem', color: '#475569', marginBottom: '24px', lineHeight: 1.6, borderLeft: '3px solid #3b82f6', paddingLeft: '16px' }}>
                    <span style={{ fontWeight: 800, color: '#0f172a', display: 'block', fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px' }}>The Verdict</span>
                    "{product.verdict || "An excellent choice offering great performance at a competitive price point."}"
                </p>

                {product.pros && product.pros.length > 0 && (
                    <div style={{ marginBottom: '30px', background: '#f8fafc', borderRadius: '12px', padding: '16px' }}>
                        {product.pros.slice(0, 2).map((pro, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'start', gap: '10px', marginBottom: '8px', fontSize: '0.85rem', color: '#334155' }}>
                                <span style={{ color: '#10b981', fontWeight: 'bold' }}>✔</span> {pro}
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '10px', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 700 }}>Current Price</span>
                        <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a' }}>{product.price}</div>
                    </div>
                    <button style={{
                        background: '#0f172a', color: '#ffffff', padding: '14px 28px', borderRadius: '12px',
                        fontWeight: 700, fontSize: '0.9rem', border: 'none', cursor: 'pointer',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        Check Price <span style={{ marginLeft: '8px' }}>&rarr;</span>
                    </button>
                </div>

            </div>
        </div>
      </div>
    </div>
  );
};
