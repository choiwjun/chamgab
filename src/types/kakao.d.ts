// @TASK P2-S3-T2 - Kakao Maps 타입 선언
// @SPEC specs/screens/search-map.yaml

declare namespace kakao {
  namespace maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class LatLngBounds {
      constructor(sw: LatLng, ne: LatLng);
      getSouthWest(): LatLng;
      getNorthEast(): LatLng;
      contain(latlng: LatLng): boolean;
    }

    class Map {
      constructor(container: HTMLElement, options: MapOptions);
      setCenter(latlng: LatLng): void;
      getCenter(): LatLng;
      setLevel(level: number, options?: { animate: boolean }): void;
      getLevel(): number;
      getBounds(): LatLngBounds;
      panTo(latlng: LatLng): void;
      relayout(): void;
    }

    interface MapOptions {
      center: LatLng;
      level?: number;
    }

    class Marker {
      constructor(options: MarkerOptions);
      setMap(map: Map | null): void;
      getPosition(): LatLng;
    }

    interface MarkerOptions {
      position: LatLng;
      map?: Map;
      clickable?: boolean;
      image?: MarkerImage;
    }

    class MarkerImage {
      constructor(src: string, size: Size, options?: MarkerImageOptions);
    }

    interface MarkerImageOptions {
      offset?: Point;
      alt?: string;
      shape?: string;
      coords?: string;
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Point {
      constructor(x: number, y: number);
    }

    class CustomOverlay {
      constructor(options: CustomOverlayOptions);
      setMap(map: Map | null): void;
      setPosition(position: LatLng): void;
    }

    interface CustomOverlayOptions {
      position: LatLng;
      content: HTMLElement | string;
      map?: Map;
      clickable?: boolean;
      xAnchor?: number;
      yAnchor?: number;
      zIndex?: number;
    }

    namespace event {
      function addListener(
        target: Map | Marker,
        type: string,
        handler: (...args: any[]) => void
      ): void;
      function removeListener(
        target: Map | Marker,
        type: string,
        handler: (...args: any[]) => void
      ): void;
    }

    namespace services {
      class Geocoder {
        addressSearch(
          address: string,
          callback: (result: any[], status: Status) => void
        ): void;
        coord2Address(
          lng: number,
          lat: number,
          callback: (result: any[], status: Status) => void
        ): void;
      }

      enum Status {
        OK = 'OK',
        ZERO_RESULT = 'ZERO_RESULT',
        ERROR = 'ERROR',
      }
    }

    class MarkerClusterer {
      constructor(options: MarkerClustererOptions);
      addMarker(marker: Marker): void;
      addMarkers(markers: Marker[]): void;
      removeMarker(marker: Marker): void;
      removeMarkers(markers: Marker[]): void;
      clear(): void;
      redraw(): void;
    }

    interface MarkerClustererOptions {
      map: Map;
      markers?: Marker[];
      gridSize?: number;
      averageCenter?: boolean;
      minLevel?: number;
      minClusterSize?: number;
      styles?: any[];
      texts?: string[] | ((size: number) => string);
      calculator?: (size: number) => number[];
      disableClickZoom?: boolean;
      clickable?: boolean;
      hoverable?: boolean;
    }
  }
}

interface Window {
  kakao: typeof kakao;
}
