;; Orbital Logistics Coordinator
;; Manages complex scheduling and routing of interplanetary cargo
;; Handles launch window calculations, cargo manifests, automated customs, and supply chain optimization

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-invalid-parameters (err u102))
(define-constant err-insufficient-fuel (err u103))
(define-constant err-invalid-launch-window (err u104))
(define-constant err-cargo-full (err u105))
(define-constant err-unauthorized (err u106))

;; Celestial body identifiers
(define-constant earth u1)
(define-constant moon u2)
(define-constant mars u3)
(define-constant jupiter u4)
(define-constant saturn u5)
(define-constant asteroid-belt u6)

;; Mission status constants
(define-constant status-planned u1)
(define-constant status-launched u2)
(define-constant status-in-transit u3)
(define-constant status-arrived u4)
(define-constant status-completed u5)
(define-constant status-failed u6)

;; Data Maps

;; Cargo manifests with detailed tracking
(define-map cargo-manifests
    { cargo-id: uint }
    {
        origin: uint,
        destination: uint,
        cargo-type: (string-ascii 50),
        mass-kg: uint,
        volume-m3: uint,
        priority: uint,
        owner: principal,
        launch-window-start: uint,
        launch-window-end: uint,
        estimated-arrival: uint,
        status: uint,
        customs-cleared: bool,
        quarantine-required: bool,
        created-at: uint
    }
)

;; Launch windows with orbital mechanics calculations
(define-map launch-windows
    { window-id: uint }
    {
        origin: uint,
        destination: uint,
        window-start: uint,
        window-end: uint,
        delta-v-required: uint,
        transit-time-days: uint,
        fuel-cost-factor: uint,
        optimal-departure: uint,
        gravity-assists: (list 5 uint),
        created-by: principal
    }
)

;; Supply chain routes with optimization parameters
(define-map supply-routes
    { route-id: uint }
    {
        origin: uint,
        destination: uint,
        route-type: (string-ascii 30),
        base-cost: uint,
        time-factor: uint,
        reliability-score: uint,
        cargo-capacity: uint,
        next-available: uint,
        operator: principal,
        active: bool
    }
)

;; Customs and inspection records
(define-map customs-records
    { cargo-id: uint }
    {
        inspection-status: uint,
        quarantine-days: uint,
        clearance-time: uint,
        inspector: principal,
        notes: (string-ascii 500),
        approved: bool,
        created-at: uint
    }
)

;; Logistics providers and their capabilities
(define-map logistics-providers
    { provider: principal }
    {
        name: (string-ascii 100),
        capabilities: (list 10 uint),
        reputation-score: uint,
        total-missions: uint,
        successful-missions: uint,
        staked-tokens: uint,
        active: bool,
        registered-at: uint
    }
)

;; Data Variables
(define-data-var cargo-id-nonce uint u0)
(define-data-var window-id-nonce uint u0)
(define-data-var route-id-nonce uint u0)
(define-data-var total-cargo-processed uint u0)
(define-data-var total-fuel-savings uint u0)

;; Private Functions

;; Calculate delta-v requirements between celestial bodies
(define-private (calculate-delta-v (origin uint) (destination uint))
    (if (is-eq origin destination)
        u0
        (if (or (and (is-eq origin earth) (is-eq destination moon))
                (and (is-eq origin moon) (is-eq destination earth)))
            u3200  ;; Earth-Moon ~3.2 km/s
            (if (or (and (is-eq origin earth) (is-eq destination mars))
                    (and (is-eq origin mars) (is-eq destination earth)))
                u6000  ;; Earth-Mars ~6.0 km/s
                (if (is-eq destination asteroid-belt)
                    u5500  ;; To asteroid belt ~5.5 km/s
                    u8000  ;; Outer planets ~8+ km/s
                )
            )
        )
    )
)

;; Calculate optimal launch window based on orbital mechanics
(define-private (calculate-launch-window (origin uint) (destination uint) (current-time uint))
    (let (
        (base-window current-time)
        (synodic-period (if (and (is-eq origin earth) (is-eq destination mars))
                           u22819200  ;; ~26 months in seconds
                           u2592000   ;; ~30 days default
                       ))
        (window-duration u1209600)  ;; ~14 days window
    )
    {
        window-start: (+ base-window synodic-period),
        window-end: (+ base-window synodic-period window-duration),
        optimal-time: (+ base-window synodic-period (/ window-duration u2))
    })
)

;; Calculate fuel cost based on cargo mass and delta-v
(define-private (calculate-fuel-cost (mass-kg uint) (delta-v uint))
    (/ (* mass-kg delta-v) u1000)  ;; Simplified fuel calculation
)

;; Validate cargo parameters
(define-private (is-valid-cargo (mass-kg uint) (volume-m3 uint) (priority uint))
    (and 
        (> mass-kg u0)
        (> volume-m3 u0)
        (<= priority u5)
        (<= mass-kg u100000)  ;; Max 100 tons
        (<= volume-m3 u1000)  ;; Max 1000 cubic meters
    )
)

;; Check if launch window is valid
(define-private (is-valid-launch-window (window-start uint) (window-end uint) (current-time uint))
    (and 
        (> window-start current-time)
        (> window-end window-start)
        (< (- window-end window-start) u2592000)  ;; Max 30 days window
    )
)

;; Public Functions

;; Register a new cargo manifest
(define-public (register-cargo-manifest 
    (origin uint) 
    (destination uint) 
    (cargo-type (string-ascii 50)) 
    (mass-kg uint) 
    (volume-m3 uint) 
    (priority uint)
    (quarantine-required bool)
)
    (let (
        (cargo-id (+ (var-get cargo-id-nonce) u1))
        (current-time (unwrap! (get-stacks-block-info? time (- stacks-block-height u1)) err-invalid-parameters))
        (launch-window (calculate-launch-window origin destination current-time))
    )
    (asserts! (is-valid-cargo mass-kg volume-m3 priority) err-invalid-parameters)
    (asserts! (not (is-eq origin destination)) err-invalid-parameters)
    
    (map-set cargo-manifests
        { cargo-id: cargo-id }
        {
            origin: origin,
            destination: destination,
            cargo-type: cargo-type,
            mass-kg: mass-kg,
            volume-m3: volume-m3,
            priority: priority,
            owner: tx-sender,
            launch-window-start: (get window-start launch-window),
            launch-window-end: (get window-end launch-window),
            estimated-arrival: (+ (get window-end launch-window) u7776000), ;; +90 days transit
            status: status-planned,
            customs-cleared: false,
            quarantine-required: quarantine-required,
            created-at: current-time
        }
    )
    
    (var-set cargo-id-nonce cargo-id)
    (var-set total-cargo-processed (+ (var-get total-cargo-processed) u1))
    (ok cargo-id))
)

;; Create optimized launch window
(define-public (create-launch-window
    (origin uint)
    (destination uint)
    (window-start uint)
    (window-end uint)
    (gravity-assists (list 5 uint))
)
    (let (
        (window-id (+ (var-get window-id-nonce) u1))
        (delta-v (calculate-delta-v origin destination))
        (current-time (unwrap! (get-stacks-block-info? time (- stacks-block-height u1)) err-invalid-parameters))
    )
    (asserts! (is-valid-launch-window window-start window-end current-time) err-invalid-launch-window)
    (asserts! (not (is-eq origin destination)) err-invalid-parameters)
    
    (map-set launch-windows
        { window-id: window-id }
        {
            origin: origin,
            destination: destination,
            window-start: window-start,
            window-end: window-end,
            delta-v-required: delta-v,
            transit-time-days: (/ (- window-end window-start) u86400),
            fuel-cost-factor: (/ delta-v u100),
            optimal-departure: (+ window-start (/ (- window-end window-start) u2)),
            gravity-assists: gravity-assists,
            created-by: tx-sender
        }
    )
    
    (var-set window-id-nonce window-id)
    (ok window-id))
)

;; Update cargo status during mission
(define-public (update-cargo-status (cargo-id uint) (new-status uint))
    (let (
        (cargo (unwrap! (map-get? cargo-manifests { cargo-id: cargo-id }) err-not-found))
    )
    (asserts! (is-eq tx-sender (get owner cargo)) err-unauthorized)
    (asserts! (<= new-status status-failed) err-invalid-parameters)
    
    (map-set cargo-manifests
        { cargo-id: cargo-id }
        (merge cargo { status: new-status })
    )
    (ok true))
)

;; Process automated customs clearance
(define-public (process-customs-clearance 
    (cargo-id uint) 
    (quarantine-days uint) 
    (notes (string-ascii 500))
)
    (let (
        (cargo (unwrap! (map-get? cargo-manifests { cargo-id: cargo-id }) err-not-found))
        (current-time (unwrap! (get-stacks-block-info? time (- stacks-block-height u1)) err-invalid-parameters))
    )
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)  ;; Only authorized inspectors
    
    (map-set customs-records
        { cargo-id: cargo-id }
        {
            inspection-status: u2,  ;; Completed
            quarantine-days: quarantine-days,
            clearance-time: current-time,
            inspector: tx-sender,
            notes: notes,
            approved: true,
            created-at: current-time
        }
    )
    
    (map-set cargo-manifests
        { cargo-id: cargo-id }
        (merge cargo { customs-cleared: true })
    )
    (ok true))
)

;; Register logistics provider
(define-public (register-logistics-provider 
    (name (string-ascii 100)) 
    (capabilities (list 10 uint)) 
    (staked-tokens uint)
)
    (let (
        (current-time (unwrap! (get-stacks-block-info? time (- stacks-block-height u1)) err-invalid-parameters))
    )
    (asserts! (> staked-tokens u0) err-invalid-parameters)
    
    (map-set logistics-providers
        { provider: tx-sender }
        {
            name: name,
            capabilities: capabilities,
            reputation-score: u100,  ;; Starting reputation
            total-missions: u0,
            successful-missions: u0,
            staked-tokens: staked-tokens,
            active: true,
            registered-at: current-time
        }
    )
    (ok true))
)

;; Create supply route
(define-public (create-supply-route
    (origin uint)
    (destination uint)
    (route-type (string-ascii 30))
    (base-cost uint)
    (cargo-capacity uint)
    (next-available uint)
)
    (let (
        (route-id (+ (var-get route-id-nonce) u1))
    )
    (asserts! (not (is-eq origin destination)) err-invalid-parameters)
    (asserts! (> cargo-capacity u0) err-invalid-parameters)
    
    (map-set supply-routes
        { route-id: route-id }
        {
            origin: origin,
            destination: destination,
            route-type: route-type,
            base-cost: base-cost,
            time-factor: u100,  ;; Default time factor
            reliability-score: u100,
            cargo-capacity: cargo-capacity,
            next-available: next-available,
            operator: tx-sender,
            active: true
        }
    )
    
    (var-set route-id-nonce route-id)
    (ok route-id))
)

;; Read-only functions

;; Get cargo manifest details
(define-read-only (get-cargo-manifest (cargo-id uint))
    (map-get? cargo-manifests { cargo-id: cargo-id })
)

;; Get launch window details
(define-read-only (get-launch-window (window-id uint))
    (map-get? launch-windows { window-id: window-id })
)

;; Get customs record
(define-read-only (get-customs-record (cargo-id uint))
    (map-get? customs-records { cargo-id: cargo-id })
)

;; Get logistics provider info
(define-read-only (get-logistics-provider (provider principal))
    (map-get? logistics-providers { provider: provider })
)

;; Get supply route details
(define-read-only (get-supply-route (route-id uint))
    (map-get? supply-routes { route-id: route-id })
)

;; Get next cargo ID
(define-read-only (get-next-cargo-id)
    (+ (var-get cargo-id-nonce) u1)
)

;; Get system statistics
(define-read-only (get-system-stats)
    {
        total-cargo-processed: (var-get total-cargo-processed),
        total-fuel-savings: (var-get total-fuel-savings),
        next-cargo-id: (get-next-cargo-id),
        next-window-id: (+ (var-get window-id-nonce) u1),
        next-route-id: (+ (var-get route-id-nonce) u1)
    }
)
