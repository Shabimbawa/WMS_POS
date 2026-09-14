import type { CSSProperties } from "react";

  export const containerStyle: CSSProperties = {
    display: 'flex',
    height: '100vh',
    width: '100%',
    overflow: 'hidden',
    
  };


  

  export const rightHalfStyle: CSSProperties = {

    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    
  };

  export const cardStyle: CSSProperties = {
    width: 360,
    padding: 24,
    borderRadius: 5,
    flexDirection: 'column',
    backgroundColor: 'var(--bg)',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    border: '1px solid var(--border)',
  };
