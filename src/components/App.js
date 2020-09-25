import _ from 'lodash';
import seedrandom from 'seedrandom';
import qs from 'query-string';
import AppBar from "@material-ui/core/AppBar";
import Button from "@material-ui/core/Button";
import {
  createMuiTheme,
  MuiThemeProvider,
  withStyles
} from "@material-ui/core/styles";
import Toolbar from "@material-ui/core/Toolbar";
import Typography from "@material-ui/core/Typography";
import Slider from "@material-ui/lab/Slider";
import * as d3 from "d3";
import React, { Component } from "react";
import "../style/App.css";
import { getClusters } from "../util/clusterDescriptions";
import { createSubgroups } from "../util/generateSubgroups";
import {
  METRICS,
  PRIMARY_COLOR,
  SECONDARY_COLOR,
  TERTIARY_COLOR
} from "../util/globals";
import worker from "../workers/dataLoader.js";
import WebWorker from "../workers/WebWorker";
//import ExpandedCard from "./ExpandedCard";
import FeatureDrawer from "./FeatureDrawer";
// import GroupSuggestions from "./GroupSuggestions";
import MetricSelector from "./MetricSelector";
import StripPlot from "./StripPlot";
import Welcome from "./Welcome";
// import ReactGA from 'react-ga';

const humans = loadWithHumans();

// ReactGA.initialize('UA-50459890-3');
// ReactGA.pageview(window.location.pathname + window.location.search);

const theme = createMuiTheme({
  palette: {
    primary: {
      main: PRIMARY_COLOR
    },
    secondary: {
      main: SECONDARY_COLOR
    }
  },
  overrides: {
    MuiSlider: {
      thumb: {
        backgroundColor: "#EBEBEB"
      },
      track: {
        backgroundColor: "#EBEBEB"
      }
    }
  }
});

const styles = {
  appBar: {
    zIndex: 1
  },
  body: {
    display: "flex",
    flexDirection: "inline"
  },
  content: {
    width: "55%",
    display: "flex",
    flexDirection: "column",
    marginTop: 65,
    marginLeft: 10
  },
  plot: {
    width: "100%"
  },
  map: {
    marginTop: 65,
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  slider: {
    width: 150,
    padding: 20,
    marginRight: 30
  },
  reset: {
    float: "right"
  },
  subtitle: {
    flexGrow: 1,
    color: TERTIARY_COLOR,
    textAlign: "center"
  },
  tagline: {
    flexGrow: 1,
    marginLeft: 30,
    color: TERTIARY_COLOR,
    textAlign: "left"
  },
  loadingScreen: {
    minWidth: "100%",
    minHeight: "calc(100% + 22px)",
    marginTop: -22,
    backgroundColor: PRIMARY_COLOR,
    margin: "0px auto"
  },
  loadingText: {
    paddingTop: 150,
    color: "white",
    textAlign: "center"
  },
  loadingProgress: {
    display: "block",
    marginLeft: "auto",
    marginRight: "auto",
    color: "white"
  },
  datasets: {
    width: "600px",
    margin: "0px auto",
    marginTop: 10
  },
  tabletitle: {
    marginTop: 50,
    color: "white",
    textAlign: "center"
  },
  title: {
    fontWeight: 800
  },
  adddata: {
    color: "white",
    textAlign: "center"
  }
};

class App extends Component {
  constructor(props) {
    super(props);
    document.title = "FairVis - Audit Classification for Intersectional Bias";

    /**
     * Every subgroup in the activeGroups array should have the following form:
     * {
     *  feats: -> Array of features defining the group
     *  vals: -> Array of values corresponding to the features (same indices)
     *  insts: -> Array of all the instances belonging to the subgroup
     *  metrics: -> Object containing all the base metrics (Acc, Prec, etc.)
     *  type: -> The type of subgroup it is, either 'top' or 'bottom'
     *  distrib: -> Value distribution for each feature
     * }
     */
    this.state = {

      cities: [],

      // Array of instances with features, label, class output, and cluster
      data: [],
      noiseStep: 0,
      fromDisk: null,

      // distribution counts of data in same order as features, sorted by value
      dataDistrib: {},
      // Array of clusters from DBSCAN with metrics and value distribution
      clusters: [],
      // Array of active groups with values and metrics
      activeGroups: [],
      // Object of metrics for the overall group
      avgs: [],

      // Features and values for all instances
      features: [],
      values: [],

      // State of StripPlot
      hovered: -1,
      clicked: -1,

      // State for selected metrics, by default accuracy, recall, and specificity
      selectedMetrics: METRICS.slice(5, 7),

      minSize: 0,

      loading: 0,
      dataLoaded: false,
      clustersLoaded: false,
    };
  }

  onDeploy = e => {
    const id = (this.state.cities.length === 0) ? 1 : this.state.cities[this.state.cities.length - 1].id + 1;
    const newCity = {
      id: id,
      left: 20 + Math.random() * 480,
      top: 20 + Math.random() * 240,
      humans: _.range(0, 15 + Math.random() * 5).map(i => {
        return {
          id: [id,i].join(':'),
          src: "/green_square_yay.png"
        };
      })
    };

    this.setState({
      cities: this.state.cities.concat(newCity)
    });
  };

  onFeatureDrawerSubgroups = groups => {
    console.log('onFeatureDrawerSubgroups', groups);
  };

  loadData = data => {
    this.setState({datasetRef: data});
    // console.log('loadData', data);
    // const noiser = makeNoiser({
    //   readState: () => this.state,
    //   setState: this.setState.bind(this),
    //   config: humans.config
    // });
    // noiser.start(data);
  };

  // Either -1 or the cluster that was hovered.
  suggestedHover = clust => {
    d3.selectAll(".linehover").classed("linehover", false);

    const foundArr = this.state.activeGroups.filter(
      el => el.clusterid === clust.clusterid
    );

    if (foundArr.length === 0) {
      clust.id = this.state.activeGroups.length;

      this.setState(
        {
          activeGroups: this.state.activeGroups.concat(clust),
          hovered: clust.id
        },
        () => {
          d3.selectAll("#linecluster" + clust.id).classed("linehover", true);
          d3.selectAll("#linecluster" + this.state.clicked).classed(
            "lineclick",
            true
          );
        }
      );
    } else {
      d3.selectAll("#linecluster" + foundArr[0].id).classed("linehover", true);
      this.setState(
        {
          hovered: foundArr[0].id
        },
        () => {
          d3.selectAll("#linecluster" + this.state.clicked).classed(
            "lineclick",
            true
          );
        }
      );
    }
  };

  suggestedUnhover = clust => {
    d3.selectAll(".linehover").classed("linehover", false);

    let newActives = this.state.activeGroups.filter(
      e => e.id === this.state.clicked || e.id !== clust.id
    );

    this.setState(
      {
        activeGroups: newActives,
        hovered: -1
      },
      () => {
        d3.selectAll("#linecluster" + this.state.clicked).classed(
          "lineclick",
          true
        );
      }
    );
  };

  /**
   * Have to set id to length -1 since groups gets added once on hover then again
   * on click. If not it breaks when hovering later on
   */
  suggestedClick = clust => {
    d3.selectAll(".lineclick").classed("lineclick", false);

    const foundArr = this.state.activeGroups.filter(
      el => el.clusterid === clust.clusterid
    );

    if (foundArr.length === 0) {
      clust.id = this.state.activeGroups.length;

      this.setState(
        {
          activeGroups: this.state.activeGroups.concat(clust),
          clicked: clust.id
        },
        () => {
          d3.selectAll("#linecluster" + clust.id).classed("lineclick", true);
        }
      );
    } else {
      d3.selectAll("#linecluster" + foundArr[0].id).classed("lineclick", true);
      this.setState({
        clicked: foundArr[0].id
      });
    }
  };

  barHover = id => {
    d3.selectAll(".linehover").classed("linehover", false);

    d3.selectAll("#linecluster" + id).classed("linehover", true);

    this.setState({
      hovered: id
    });
  };

  barClick = id => {
    d3.selectAll(".lineclick").classed("lineclick", false);
    d3.selectAll("#linecluster" + id).classed("lineclick", true);

    this.setState({
      clicked: id
    });
  };

  changeMinSize = (_, val) => {
    this.setState({
      minSize: val
    });
  };

  resetGroups = () => {
    this.setState({
      hovered: -1,
      clicked: -1,
      minSize: 0,
      activeGroups: []
    });
  };

  handleMetricsChange = m => {
    this.setState({
      selectedMetrics: m
    });
  };

  render() {
    let classes = this.props.classes;

    if (!this.state.datasetRef) {
      return <Welcome loadData={this.loadData} loading={this.state.loading} />;
    }

    return (
      <MuiThemeProvider theme={theme}>
        <AppBar position="fixed" className={classes.appBar}>
          <Toolbar>
            <Typography
              inline
              variant="h4"
              color="inherit"
              className={classes.title}
            >
              FairVis
            </Typography>
            <Typography inline variant="h6" className={classes.tagline}>
              {" "}
              <Button
                variant="contained"
                style={{
                  padding: 10,
                  fontSize: 18,
                  border: '1px solid darkred',
                  backgroundColor: 'red'
                }}
                color="primary"
                onClick={this.onDeploy}
              >deploy</Button>
              {" "}
              <span style={{color: 'red', fontSize: 14}}>
                seed={humans.config.seed},
                step={this.state.noiseStep},
                p={humans.config.p},
                c={this.state.city && this.state.city.id}
              </span>
            </Typography>
            <Typography variant="body1" color="inherit">
              Min size: {this.state.minSize}
            </Typography>
            <Slider
              className={classes.slider}
              value={this.state.minSize}
              onChange={this.changeMinSize}
              step={1}
              min={0}
              max={
                this.state.activeGroups.length === 0
                  ? 0
                  : d3.max(this.state.activeGroups, d => d.metrics.size)
              }
            />
            {/*<Button
              className={classes.reset}
              variant="contained"
              color="secondary"
              onClick={this.resetGroups}
            >
              Reset Groups
            </Button>*/}
          </Toolbar>
        </AppBar>
        <div className={classes.body}>
          {false && <FeatureDrawer
            features={this.state.features}
            values={this.state.values}
            createSubgroups={this.onFeatureDrawerSubgroups}
            dataDistrib={this.state.dataDistrib}
            dataLoaded={this.state.dataLoaded}
            hovered={this.state.hovered}
            clicked={this.state.clicked}
            activeGroups={this.state.activeGroups}
          />}
          {false && (
            <div className={classes.content}>
              <MetricSelector
                className={classes.metricSelector}
                onMetricChange={this.handleMetricsChange}
                suggestions={METRICS}
                selectedMetrics={this.state.selectedMetrics}
              />
              <div className={classes.plot}>
                <StripPlot
                  activeGroups={this.state.activeGroups}
                  avgs={this.state.avgs}
                  barHover={this.barHover}
                  barClick={this.barClick}
                  minSize={this.state.minSize}
                  selectedMetrics={this.state.selectedMetrics}
                />
              </div>
              {/*<GroupSuggestions
                clusters={this.state.clusters}
                minSize={this.state.minSize}
                suggestedHover={this.suggestedHover}
                suggestedUnhover={this.suggestedUnhover}
                suggestedClick={this.suggestedClick}
                clustersLoaded={this.state.clustersLoaded}
                features={this.state.features}
                values={this.state.values}
                clicked={this.state.clicked}
                activeGroups={this.state.activeGroups}
              />*/}
            </div>
          )}
          <div className={classes.map}>
            <div style={{
              padding: 20,
              height: 300,
              textAlign: 'center',
              position: 'relative',
              borderBottom: '1xp solid #eee'
            }}>
              <img
                alt="map"
                style={{position: 'absolute', left: 0, top: 0, bottom: 0, right: 0}} height={300} src="/land_sharp_1000.png" />
              {this.state.cities.map(city => (
                <City
                  key={city.id}
                  city={city}
                  isSelected={this.state.city && this.state.city.id === city.id}
                  onClick={() => this.setState({city: city})}
                />
              ))}
            </div>
            {this.state.city && (
              <CityReport
                key={this.state.city && this.state.city.id}
                copy={this.state}
                datasetRef={this.state.datasetRef}
                city={this.state.city}
              />
            )}
          </div>
        </div>
      </MuiThemeProvider>
    );
  }
}

export default withStyles(styles)(App);


function noisify(rows, options = {}) {
  let randoms = 0;
  let p = options.p || humans.config.p;
  rows.forEach((row, i) => {
    if (humans.rand() < p) {
      row.out = (humans.rand() > 0.5) ? 1 : 0;
      randoms += 1;
    }
  });
  console.log('interfering humans:', `${randoms} times, ${Math.round(100*randoms/rows.length)}% of ${rows.length} examples`);
  
  return rows;
}


function stepNoisyData(datasetRef, config, initialTransform, done) {
  console.log('stepNoisyData', datasetRef);
  // WebWorker to run preprocessing in parallel.
  let loaderWorker = new WebWorker(worker);

  loaderWorker.addEventListener("message", r => {
    let out = r.data;
    let clusters = getClusters(out.data, out.feats, out.vals);
    done({out, clusters});
  });


  d3.csv(datasetRef).then(initialTransform).then(d => {
    console.log('csv', d);
    return loaderWorker.postMessage(noisify(d));
  });
}

function loadWithHumans() {
  const queryString = qs.parse(window.location.search);
  const config = {
    p: 0.05,
    delay: 500, // ms to wait until changing (after worker)
    seed: 1000 + Math.floor(8999 * Math.random()),
    ...queryString
  };
  const rand = seedrandom(config.seed);
  return {config, rand};
}


function City({city, isSelected, onClick}) {
  const {left, top} = city;
  return (
    <div style={{
      position: 'absolute',
      left: left,
      top: top
    }}>
      <img
        onClick={onClick}
        style={{
          cursor: 'pointer',
          outline: (isSelected) ? '4px solid orange' : 0,
          width: 64,
          height: 64
        }}
        alt="peep" className="animated fast bounce infinite delay-1s" src="/city.png" />
    </div>
  );
}


function makeNoiser({readState, setState, initialTransform, config}) {
  console.log('makeNoiser');
  const load = datasetRef => {
    console.log('load');
    setState({ loading: 1 });

    function loop() {
      console.log('loop');
      stepNoisyData(datasetRef, config, initialTransform, ({out, clusters}) => {
        console.log('inner');
        const state = readState();
        setState({
          noiseStep: state.noiseStep + 1,
          data: out.data,
          dataDistrib: out.distrib,
          avgs: [out.avgs],
          features: out.feats,
          values: out.vals,
          clusters: clusters,
          dataLoaded: true,
          clustersLoaded: true,
          // minSize: Math.round(out.data.length * 0.01), // de-noising heuristic
          histories: makeHistories(state, 'fpr'),
          timestamps: (state.timestamps) ? state.timestamps.concat([Math.round((new Date()).getTime()/1000)]) : []
        });
        if (state.chosenGroups) {
          localCreateSubgroups(state.chosenGroups);
        }
        console.log('looping...', config.delay);
        setTimeout(loop, config.delay);
      });
    }

    loop();
  };

  const localCreateSubgroups = groups => {
    const state = readState();
    let subgroups = createSubgroups(
      state.data,
      groups,
      state.activeGroups.length,
      state.features,
      state.values
    );
    setState({
      chosenGroups: groups,
      activeGroups: subgroups
    });
  };

  return {
    start: load,
    setGroups: localCreateSubgroups
  };
}

class CityReport extends Component {
  constructor(props) {
    super(props);
    this.state = {
      ...this.props.copy,
      avgs: [],
      selectedMetrics: METRICS.slice(5, 7),
      hovered: -1,
      clicked: -1,
      minSize: 0,
      histories: {}
    };
  }

  componentDidMount() {
    this.noiser = makeNoiser({
      readState: () => this.state,
      setState: this.setState.bind(this),
      config: humans.config,
      initialTransform: rows => noisify(rows, {p: 0.2})
    });
    this.noiser.start(this.state.datasetRef);
    this.noiser.setGroups({
      race: [],
      sex: []
    });
  }

  handleMetricsChange = m => {
    this.setState({
      selectedMetrics: m
    });
  };
  
  // scope
  selectAll = selector => {
    return d3.select(this.el).selectAll(selector);
  };

  barHover = id => {
    this.selectAll(".linehover").classed("linehover", false);
    this.selectAll("#linecluster" + id).classed("linehover", true);
    this.setState({
      hovered: id
    });
  };

  barClick = id => {
    this.selectAll(".lineclick").classed("lineclick", false);
    this.selectAll("#linecluster" + id).classed("lineclick", true);
    this.setState({
      clicked: id
    });
  };


  render() {
    const state = this.state;
    return (
      <div style={{flex: 1, padding: 10}} ref={el => this.el = el}>
        <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center'}}>
          <h2 style={{marginRight: 10}}>City: {this.props.city.id}</h2>
          <div>{this.props.city.humans.map(human => (
            <img
              key={human.id}
              alt="human"
              src={human.src}
              style={{
                width: 32,
                height: 32
              }}
            />
          ))}</div>
        </div>
        <div>
          <MetricSelector
            // className={classes.metricSelector}
            onMetricChange={this.handleMetricsChange}
            suggestions={METRICS}
            selectedMetrics={state.selectedMetrics}
          />
          <div>
            <StripPlot
              activeGroups={this.state.activeGroups}
              avgs={this.state.avgs}
              barHover={this.barHover}
              barClick={this.barClick}
              minSize={state.minSize}
              selectedMetrics={state.selectedMetrics}
            />
          </div>
        </div>
        <div style={{height: 200, width: 800, overflow: 'hidden'}}>
          <Histories
            activeGroups={this.state.activeGroups}
            timestamps={this.state.timestamps}
            histories={this.state.histories}
          />
        </div>
      </div>
    );
  }
}

function makeHistories(state, metricKey) {
  const {histories, activeGroups, selectedMetrics, avgs} = state;
  // const metrics = activeGroups.metrics; // selectedMetrics
  // const groups = {};
  // selectedMetrics.forEach(m => {
  //   groups[m.value] = [];
  //   if (histories[m.value]) {
  //     groups[m.value] = groups[m.value].concat(histories[m.value]);
  //   }
  //   groups.forEach(d => {
  //     groups[m.value].push(d[m.value]);
  //   });
  // });

  const updatedHistories = {};
  activeGroups.forEach(activeGroup => {
    if (!histories[activeGroup.id]) {
      updatedHistories[activeGroup.id] = [];
    }
    updatedHistories[activeGroup.id] = []
      .concat(histories[activeGroup.id])
      .concat([activeGroup.metrics[metricKey]])
  });

  console.log('updatedHistories', updatedHistories);
  return updatedHistories;

}


class Histories extends Component {
  componentDidUpdate() {
    const {timestamps, activeGroups, histories} = this.props;
    if (!timestamps || histories.length === 0) {
      return;
    }
    this.el.innerHTML = '';
    const uPlot = window.uPlot;

    const colors = [
      'red',
      'blue',
      'green',
      'orange',
      'purple',
      'brown'
    ];
    const series = [{}].concat(activeGroups.map((activeGroup, index) => {
      const text = _.range(0, activeGroup.feats.length).map(i => 
        [activeGroup.feats[i], activeGroup.vals[i]].join('=')
      ).join(', ');
      return {
        // label: text,
        stroke: colors[index % colors.length],
        width: 1,
        // fill: "rgba(255, 0, 0, 0.2)",
        dash: [10, 5],
        scale: "%",
      };
    }));
    
    const opts = {
      width: 800,
      height: 200,
      axes: [
        {},
        { scale: "%" }
      ],
      scales: {
        '%': {
          auto: false,
          range: [0, 100],
        }
      },
      series: series,
      
    };
    const data = [timestamps || []];
    Object.keys(histories).forEach(key => {
      data.push(histories[key]);
    });
    console.log('opts', opts);
    console.log('data', data);
    if (data.length <= 1) return;

    new uPlot(opts, data, this.el);
  }

  render() {
    return <div ref={el => this.el = el} />;
  }
}