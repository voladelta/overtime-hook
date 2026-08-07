import { ChevronRight, Wallet } from "lucide-react"
import { useState } from "react"
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi"

import { compactAddress } from "@/lib/format"

import { Button } from "./Button"

export function WalletControl() {
  const connection = useConnection()
  const connectors = useConnectors()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const [open, setOpen] = useState(false)

  const connectWallet = (connector = connectors[0]) => {
    if (!connector) return
    connect.mutate({ connector })
    setOpen(false)
  }

  return (
    <div
      className="wallet-control"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setOpen(false)
      }}
    >
      <Button
        variant={connection.isConnected ? "secondary" : "primary"}
        size="sm"
        leadingIcon={Wallet}
        loading={connect.isPending}
        aria-expanded={open}
        aria-controls="wallet-menu"
        onClick={() => {
          if (connection.isConnected || connectors.length > 1) setOpen((value) => !value)
          else connectWallet()
        }}
      >
        {connection.address ? compactAddress(connection.address) : "Connect"}
      </Button>

      <div
        id="wallet-menu"
        className="wallet-menu"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
      >
        {connection.isConnected ? (
          <button
            type="button"
            onClick={() => {
              disconnect.mutate()
              setOpen(false)
            }}
          >
            Disconnect <ChevronRight size={14} />
          </button>
        ) : (
          connectors.map((connector) => (
            <button key={connector.uid} type="button" onClick={() => connectWallet(connector)}>
              {connector.name} <ChevronRight size={14} />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
